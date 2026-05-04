/*
================================================================================
EKHOBOT WEB CRAWLER AND INDEXER
================================================================================
Crawls CSUCI website, extracts text, generates embeddings, stores in database.

Process:
  - Fetch URLs from sitemap.xml
  - Visit each page and extract clean text
  - Split text into 800-character chunks
  - Generate vector embeddings for each chunk
  - Save to PostgreSQL database with pgvector

Run: node scripts/index.js
================================================================================
*/

import 'dotenv/config';
import * as cheerio from 'cheerio';
import pg from 'pg';
import { pipeline } from '@xenova/transformers';
import pdfParse from 'pdf-parse-new';

/*
================================================================================
DATABASE CONNECTION
================================================================================
*/
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

/*
================================================================================
EMBEDDING MODEL
================================================================================
Local AI model for text to vector conversion
*/
let embedder = null;

/*
FUNCTION: loadEmbedder
PURPOSE: Load and cache the embedding model
RETURNS: The loaded pipeline
*/
async function loadEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model (first run only, downloads ~25MB)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Model ready.');
  }
  return embedder;
}

/*
================================================================================
SITEMAP FETCHING
================================================================================
*/

/*
FUNCTION: getSitemapUrls
PURPOSE: Download and parse all URLs from CSUCI sitemap
RETURNS: Array of cleaned URLs ready to crawl
*/
async function getSitemapUrls() {
  try {
    console.log('Fetching sitemap...');
    const res = await fetch('https://www.csuci.edu/sitemap.xml');
    const xml = await res.text();
    
    // Extract all <loc>URL</loc> tags from html
    const matches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
    
    const urls = matches
      .map(m => m.replace(/<\/?loc>/g, '').trim())  // Remove XML tags
      .filter(url =>
        url.includes('csuci.edu') &&                // Only CSUCI
        !url.includes('?') &&                       // No query params
        !url.match(/\.(pptx|docx|zip|mp4|mp3|css|js)$/i)  // No media files
      );
    
    console.log(`Found ${urls.length} URLs in sitemap\n`);
    return urls;
    
  } catch (err) {
    console.log('Sitemap fetch failed:', err.message);
    return [];
  }
}

/*
================================================================================
EMBEDDING GENERATION
================================================================================
*/

/*
FUNCTION: getEmbedding
PURPOSE: Convert text into 384 dimension vector
PARAMETERS: text (string)
RETURNS: Array of 384 numbers
*/
async function getEmbedding(text) {
  const model = await loadEmbedder();
  
  // Limit of 8000 chars to avoid model limits
  const output = await model(text.slice(0, 8000), {
    pooling: 'mean',      // Average token embeddings
    normalize: true       // Normalize for similarity
  });
  
  return Array.from(output.data);
}

/*
================================================================================
TEXT PROCESSING
================================================================================
*/

/*
FUNCTION: chunkText
PURPOSE: Split long text into 800 char chunks for better embeddings
PARAMETERS: text (string), size (number, default 800)
RETURNS: Array of text chunks
*/
function chunkText(text, size = CHUNK_SIZE) {
  const chunks = [];
  
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk.length > 50) chunks.push(chunk);  // Skip tiny fragments
  }
  
  return chunks;
}

/*
FUNCTION: saveChunk
PURPOSE: Generate embedding and save chunk to database
PARAMETERS: url (string), title (string), content (string)
*/
async function saveChunk(url, title, content) {
  try {
    const embedding = await getEmbedding(content);
    
    await db.query(
      `INSERT INTO csuci_chunks (url, title, content, embedding)
       VALUES ($1, $2, $3, $4)`,
      [url, title, content, JSON.stringify(embedding)]
    );
    
  } catch (err) {
    console.log(`Failed to save chunk from ${url}: ${err.message}`);
  }
}

/*
================================================================================
PDF EXTRACTION
================================================================================
*/

/*
FUNCTION: extractPdf
PURPOSE: Download PDF and extract text
PARAMETERS: url (string)
RETURNS: Extracted text or null if failed
*/
async function extractPdf(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EkhoBot/1.0 (CSUCI Capstone)' },
      signal: AbortSignal.timeout(15000),
    });
    const buffer = await res.arrayBuffer();

    // Silence pdf parse library console noise
    const origLog = console.log;
    const origInfo = console.info;
    const origWarn = console.warn;
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};

    let data;
    try {
      data = await pdfParse(Buffer.from(buffer));
    } finally {
      // Always restore console
      console.log = origLog;
      console.info = origInfo;
      console.warn = origWarn;
    }

    const text = data.text.replace(/\s+/g, ' ').trim();
    
    // Reject PDFs with minimal text (likely to be image only)
    if (text.length < 50) return null;

    console.log(`  PDF read: ${text.length} chars from ${url.split('/').pop()}`);
    return text;

  } catch (err) {
    console.log(`  PDF failed (${url.split('/').pop()}): ${err.message}`);
    return null;
  }
}

/*
================================================================================
CONFIGURATION
================================================================================
*/

const MAX_PAGES = 500;      // Max pages to crawl before stopping
const CHUNK_SIZE = 800;     // Characters per text chunk

/*
================================================================================
MAIN CRAWLER
================================================================================
*/

/*
FUNCTION: crawl
PURPOSE: Main crawler that processes sitemap URLs and discovers more via links
PROCESS:
  1. Fetch sitemap URLs
  2. Process each URL (HTML or PDF)
  3. Extract and chunk text
  4. Generate embeddings
  5. Save to database
  6. Discover new links on each page
*/
async function crawl() {
  // Track visited and queued URLs
  const visited = new Set();
  const queued = new Set();  // Set instead of array.includes() for O(1) lookup
  
  // Get initial URLs from sitemap
  const sitemapUrls = await getSitemapUrls();
  const queue = [...sitemapUrls];
  sitemapUrls.forEach(url => queued.add(url));  // Mark all as queued
  
  let pageCount = 0;
  let chunkCount = 0;

  console.log('Clearing old data from database...');
  await db.query('DELETE FROM csuci_chunks');

  console.log(`Starting crawl of up to ${MAX_PAGES} pages...\n`);

  // Main crawl loop
  while (queue.length > 0 && pageCount < MAX_PAGES) {
    const url = queue.shift();
    
    if (visited.has(url)) continue;
    
    visited.add(url);
    pageCount++;

    try {
      /*
      ================================================================
      PDF HANDLING
      ================================================================
      */
      if (url.toLowerCase().endsWith('.pdf')) {
        // Skip old PDFs (2015 and earlier)
        if (url.match(/200[0-9]|201[0-5]/)) {
          console.log(`[${pageCount}] Skipped (old PDF): ${url.split('/').pop()}`);
          continue;
        }
        
        const text = await extractPdf(url);
        
        if (text) {
          const chunks = chunkText(text);
          
          for (const chunk of chunks) {
            await saveChunk(url, 'PDF Document', chunk);
            chunkCount++;
          }
          
          console.log(`[${pageCount}] PDF — ${chunks.length} chunks saved`);
          console.log(`  URL: ${url}`);  // Show URL being crawled
        }
        
        continue;
      }

      /*
      ================================================================
      HTML PAGE HANDLING
      ================================================================
      */
      
      // Download page with 10 second timeout
      const res = await fetch(url, {
        headers: { 'User-Agent': 'EkhoBot/1.0 (CSUCI Capstone)' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.log(`[${pageCount}] Skipped (${res.status}): ${url}`);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const title = $('title').text().trim() || url;

      // Remove navigation and non content elements
      $('nav, footer, script, style, header, .menu, .navigation, .breadcrumb, .sidebar, .cookie-notice, .alert, .banner').remove();

      // Extract main content
      const text = $('main, .content, .page-content, article, #main-content, body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      // Skip pages with very little content
      if (text.length < 100) {
        console.log(`[${pageCount}] Too short, skipped: ${url}`);
        continue;
      }

      // Split and save chunks
      const chunks = chunkText(text);
      
      for (const chunk of chunks) {
        await saveChunk(url, title, chunk);
        chunkCount++;
      }

      console.log(`[${pageCount}] ${chunks.length} chunks — ${title.slice(0, 50)}`);
      console.log(`  URL: ${url}`);  // Show URL being crawled

      /*
      ================================================================
      LINK DISCOVERY
      ================================================================
      Find internal links and add to queue (goes beyond sitemap URLs)
      */
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        let fullUrl = '';

        // Convert to absolute URL
        if (href.startsWith('http') && href.includes('csuci.edu')) {
          fullUrl = href.split('#')[0].split('?')[0];
        } else if (href.startsWith('/') && !href.startsWith('//')) {
          fullUrl = 'https://www.csuci.edu' + href.split('#')[0].split('?')[0];
        }

        if (!fullUrl) return;

        const notVisited = !visited.has(fullUrl) && !queued.has(fullUrl);
        const notJunk = !fullUrl.match(/\.(jpg|jpeg|png|gif|svg|zip|mp4|mp3|css|js|ico|webp)$/i);
        const notAuth = !fullUrl.match(/login|logout|signin|signout|sso|cas/i);

        if (notVisited && notJunk && notAuth) {
          // Prioritize important pages
          const isImportant = fullUrl.match(/admissions|financialaid|housing|advising|counsel|parking|registrar|academics|student|financial|tuition|scholarship|grant|loan/i);
          
          if (isImportant) {
            queue.unshift(fullUrl);  // Front of queue
          } else {
            queue.push(fullUrl);     // End of queue
          }
          
          queued.add(fullUrl);  // Track in Set
        }
      });

      // Wait 300ms between requests
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(`[${pageCount}] Error on ${url}: ${err.message}`);
    }
  }

  /*
  ====================================================================
  CRAWL COMPLETE
  ====================================================================
  */
  console.log(`\nCrawl complete.`);
  console.log(`Pages processed: ${pageCount}`);
  console.log(`Total chunks saved: ${chunkCount}`);
  console.log(`Database is ready for EkhoBot.`);

  await db.end();
}

/*
================================================================================
START CRAWLER
================================================================================
*/
crawl();
