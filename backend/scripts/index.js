import 'dotenv/config';
import * as cheerio from 'cheerio';
import { createRequire } from 'module';
import pg from 'pg';
import { pipeline } from '@xenova/transformers';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let embedder = null;
async function loadEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model (first run only, downloads ~25MB)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Model ready.');
  }
  return embedder;
}

const SEED_URLS = [
  // Main
  'https://www.csuci.edu/',
  'https://www.csuci.edu/about/',
  'https://www.csuci.edu/contact.htm',
  'https://www.csuci.edu/calendars/index.htm',
  'https://www.csuci.edu/events/index.htm',
  'https://www.csuci.edu/students/',

  // Admissions
  'https://www.csuci.edu/admissions/',
  'https://www.csuci.edu/admissions/apply-now.htm',
  'https://www.csuci.edu/admissions/tuition-and-aid/',
  'https://www.csuci.edu/visit-campus/',
  'https://www.csuci.edu/visit-campus/tours/index.htm',
  'https://www.csuci.edu/orientation/nso-checklist.htm',

  // Academics
  'https://www.csuci.edu/academics/',

  // Student Life
  'https://www.csuci.edu/student-life/',

  // Student Affairs & Services
  'https://www.csuci.edu/studentaffairs/',
  'https://www.csuci.edu/basicneeds/index.htm',

  // Commencement
  'https://www.csuci.edu/commencement/ceremony-info/index.htm',

  // Other
  'https://www.csuci.edu/giving/',
  'https://www.csuci.edu/careers/',
  'https://www.csuci.edu/emergencyinfo/',
  'https://www.csuci.edu/titleix/',
  'https://www.csuci.edu/alumni/',
  'https://www.csuci.edu/parenting-students/index.htm',
  'https://www.csuci.edu/faculty/',
  'https://www.csuci.edu/staff/',

  // Library
  'https://library.csuci.edu',

  // Academic Advising 
  'https://www.csuci.edu/advising/',
  'https://www.csuci.edu/advising/advisor/index.htm',
  'https://www.csuci.edu/advising/advisor/drop-in-advising.htm',
  'https://www.csuci.edu/advising/resources/index.htm',
  'https://www.csuci.edu/advising/resources/freshman.htm',
  'https://www.csuci.edu/advising/resources/transfer.htm',
  'https://www.csuci.edu/advising/resources/academic-roadmaps/index.htm',
  'https://www.csuci.edu/advising/services/index.htm',
  'https://www.csuci.edu/advising/services/workshops.htm',
  'https://www.csuci.edu/advising/gsc/index.htm',
  'https://www.csuci.edu/advising/faq.htm',
  'https://www.csuci.edu/advising/contact.htm',

  // Student Services
  'https://www.csuci.edu/student-life/student-services/',
  'https://www.csuci.edu/caps/',
  'https://www.csuci.edu/dass/',
  'https://www.csuci.edu/eop/',
  'https://www.csuci.edu/careerdevelopment/',
  'https://www.csuci.edu/orientation/',
  'https://www.csuci.edu/veterans/',
  'https://www.csuci.edu/basicneeds/index.htm',
  'https://www.csuci.edu/wpe/index.htm',
  'https://www.csuci.edu/cultural-centers/index.htm',
  'https://www.csuci.edu/international/',
  'https://www.csuci.edu/studentaffairs/index.htm',
  'https://www.csuci.edu/writing-ci/guide/',
  'https://www.csuci.edu/student-life/dining.htm',
  'https://www.csuci.edu/student-life/student-activities/',
  'https://www.csuci.edu/housing/',

  // News & Events 
  'https://www.csuci.edu/news/',
  'https://www.csuci.edu/news/releases/',
  'https://www.csuci.edu/events/index.htm',
  'https://www.csuci.edu/commencement/ceremony-info/index.htm',
  'https://www.csuci.edu/calendars/index.htm',
  'https://www.csuci.edu/studentaffairs/student-marketing/calendar.htm',
  'https://www.csuci.edu/university-events/',

  // Parking — verified working
  'https://www.csuci.edu/publicsafety/parking/',
  'https://www.csuci.edu/publicsafety/parking/Parking_Forms.htm',
  'https://www.csuci.edu/publicsafety/parking/faq.htm',
  'https://www.csuci.edu/housing/accommodations-rates/parking-info.htm',
];

const MAX_PAGES = 300;
const CHUNK_SIZE = 500;

// --- Embedding using Hugging Face ---
async function getEmbedding(text) {
  const model = await loadEmbedder();
  const output = await model(text.slice(0, 8000), {
    pooling: 'mean',
    normalize: true
  });
  return Array.from(output.data);
}

// --- Split long text into smaller overlapping chunks ---
function chunkText(text, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk.length > 50) chunks.push(chunk);
  }
  return chunks;
}

// --- Save a single chunk with its embedding to the database ---
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

// --- Extract text from a PDF URL ---
async function extractPdf(url) {
  try {
    console.log(`  Reading PDF: ${url}`);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EkhoBot/1.0 (CSUCI Capstone)' },
      signal: AbortSignal.timeout(15000),
    });
    const buffer = await res.arrayBuffer();
    const data = await pdfParse(Buffer.from(buffer));
    return data.text.replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.log(`  PDF failed (${url}): ${err.message}`);
    return null;
  }
}

// --- Main crawl function ---
async function crawl() {
  const visited = new Set();
  const queue = [...SEED_URLS];
  let pageCount = 0;
  let chunkCount = 0;

  // Wipe old data so we start fresh
  console.log('Clearing old data from database...');
  await db.query('DELETE FROM csuci_chunks');

  console.log(`Starting crawl of up to ${MAX_PAGES} pages...\n`);

  while (queue.length > 0 && pageCount < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    pageCount++;

    try {
      // --- Handle PDFs separately ---
      if (url.toLowerCase().endsWith('.pdf')) {
        const text = await extractPdf(url);
        if (text) {
          const chunks = chunkText(text);
          for (const chunk of chunks) {
            await saveChunk(url, 'PDF Document', chunk);
            chunkCount++;
          }
          console.log(`[${pageCount}] PDF — ${chunks.length} chunks saved: ${url}`);
        }
        continue;
      }

      // --- Fetch HTML page ---
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

      // Remove nav, footer, scripts, ads — keep only main content
      $('nav, footer, script, style, header, .menu, .navigation, .breadcrumb, .sidebar, .cookie-notice, .alert, .banner').remove();

      const text = $('main, .content, .page-content, article, #main-content, body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length < 100) {
        console.log(`[${pageCount}] Too short, skipped: ${url}`);
        continue;
      }

      // Split into chunks and save each one
      const chunks = chunkText(text);
      for (const chunk of chunks) {
        await saveChunk(url, title, chunk);
        chunkCount++;
      }

      console.log(`[${pageCount}] ${chunks.length} chunks — ${title.slice(0, 60)}`);

      // --- Find and queue internal links and PDFs ---
      $('a[href]').each((_, el) => {
        let href = $(el).attr('href') || '';

        // Build absolute URL
        if (href.startsWith('/') && !href.startsWith('//')) {
          href = 'https://www.csuci.edu' + href;
        } else if (href.startsWith('//')) {
          href = 'https:' + href;
        }

        // Clean up anchors and query strings
        href = href.split('#')[0].split('?')[0].trim();

        const isInternal = href.includes('csuci.edu');
        const isPdf = href.toLowerCase().endsWith('.pdf');
        const notVisited = !visited.has(href) && !queue.includes(href);
        const notJunk = !href.match(/\.(jpg|jpeg|png|gif|svg|zip|mp4|mp3|css|js|ico|webp)$/i);
        const notAuth = !href.match(/login|logout|signin|signout|sso|cas/i);

        if (href && (isInternal || isPdf) && notVisited && notJunk && notAuth) {
          queue.push(href);
        }
      });

      // Small delay to be polite to the server
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log(`[${pageCount}] Error on ${url}: ${err.message}`);
    }
  }

  console.log(`\nCrawl complete.`);
  console.log(`Pages processed: ${pageCount}`);
  console.log(`Total chunks saved: ${chunkCount}`);
  console.log(`Database is ready for EkhoBot.`);

  await db.end();
}

crawl();