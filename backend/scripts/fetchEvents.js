/*
================================================================================
EKHOBOT EVENT FETCHER
================================================================================
Fetches and refreshes event and news content from CSUCI pages.
This script runs nightly to keep event information up to date.

This file is imported by server.js and runs on:
  - Server startup
  - Every night at midnight via node-cron
  - Manually via: node scripts/fetchEvents.js
================================================================================
*/

import 'dotenv/config';
import * as cheerio from 'cheerio';
import { pipeline } from '@xenova/transformers';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

/*
================================================================================
EMBEDDING MODEL
================================================================================
Local AI model for converting text into vector embeddings
Same model used by index.js for consistency
*/
let embedder = null;

/*
FUNCTION: getEmbedding
PURPOSE: Convert text into a 384 dimensional vector for semantic search
RETURNS: Array of 384 numbers representing the text meaning
*/
async function getEmbedding(text) {
  if (!embedder) {
    console.log('Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/*
================================================================================
EVENT PAGE URLS
================================================================================
List of CSUCI pages that contain event and news information
This list is expanded dynamically by auto-discovering news article links
*/
const EVENT_URLS = [
  'https://www.csuci.edu/news/',
  'https://www.csuci.edu/commencement/ceremony-info/index.htm',
  'https://www.csuci.edu/orientation/',
  'https://www.csuci.edu/student-life/student-activities/',
  'https://www.csuci.edu/student-life/',
  'https://www.csuci.edu/admissions/tuition-and-aid/',

  // Individual news articles with specific event details
  'https://www.csuci.edu/news/releases/jsbl-workshops-202632.htm',
  'https://www.csuci.edu/news/releases/2026-csurf-students.htm',
  'https://www.csuci.edu/news/releases/20260219-womens-biz-conf.htm',
  'https://www.csuci.edu/news/releases/social-justice-conf-2026210.htm',
  'https://www.csuci.edu/news/releases/esbi-spring2026.htm',
  'https://www.csuci.edu/news/releases/blackhistorymonth-202602.htm',
];

/*
================================================================================
MAIN FETCH FUNCTION
================================================================================
*/

/*
FUNCTION: fetchLatestEvents
PURPOSE: Scrape event pages, extract text, and save to database
EXPORTS: This function is imported and called by server.js
RETURNS: Promise that resolves when all events are fetched

This function:
1. Deletes old event chunks from the database
2. Auto-discovers new news article URLs from the main news page
3. Fetches each event page and extracts clean text
4. Enriches the text with event-specific prefix for better search matching
5. Saves each page with its embedding to the database
*/
export async function fetchLatestEvents() {
  console.log('Fetching latest CSUCI events...');

  // Delete old event data before fetching new content
  // Event chunks are marked with 'EVENT:' in the title field
  await db.query(`DELETE FROM csuci_chunks WHERE title LIKE 'EVENT:%'`);

  let saved = 0;

  /*
  ======================================================================
  AUTO-DISCOVER NEWS ARTICLES
  ======================================================================
  Scan the main news page for article links and add them to EVENT_URLS
  This ensures we always get the latest news articles without manual updates
  */
  try {
    const newsRes = await fetch('https://www.csuci.edu/news/', {
      headers: { 'User-Agent': 'EkhoBot/1.0' }
    });
    const newsHtml = await newsRes.text();
    const $news = cheerio.load(newsHtml);
    
    // Find all links on the news page
    $news('a[href]').each((_, el) => {
      const href = $news(el).attr('href') || '';
      let fullUrl = '';
      
      // Convert relative URLs to absolute URLs
      if (href.startsWith('http')) {
        fullUrl = href;  // Already absolute
      } else if (href.startsWith('/')) {
        fullUrl = 'https://www.csuci.edu' + href;  // Make absolute
      }
      
      // Add news release URLs that aren't already in the list
      if (fullUrl.includes('/news/releases/') && !EVENT_URLS.includes(fullUrl)) {
        EVENT_URLS.push(fullUrl);
      }
    });
    
    console.log(`Found ${EVENT_URLS.length} total pages to fetch`);
    
  } catch (e) {
    console.log('Could not auto-discover news articles');
  }

  /*
  ======================================================================
  FETCH AND SAVE EACH EVENT PAGE
  ======================================================================
  */
  for (const url of EVENT_URLS) {
    try {
      // Download the page with a 10 second timeout
      const res = await fetch(url, {
        headers: { 'User-Agent': 'EkhoBot/1.0 (CSUCI Capstone)' },
        signal: AbortSignal.timeout(10000),
      });
      
      // Skip pages that return errors
      if (!res.ok) {
        console.log(`Skipped (${res.status}): ${url}`);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      /*
      Remove navigation, scripts, and other non-content elements
      These appear on every page and add noise to search results
      */
      $('script, style, noscript, iframe, nav, footer, header').remove();
      $('[class*="cookie"], [class*="banner"], [class*="alert"], [id*="cookie"]').remove();
      $('[class*="nav"], [class*="menu"], [class*="sidebar"]').remove();

      /*
      Extract main content text
      Try to find the main content container first, fall back to body
      */
      let text = '';
      const main = $('main, #main, #main-content, .page-content, .content, article');
      if (main.length > 0) {
        text = main.text();
      } else {
        text = $('body').text();
      }

      // Clean up whitespace and formatting
      text = text
        .replace(/\t/g, ' ')           // Replace tabs with spaces
        .replace(/ {2,}/g, ' ')        // Replace multiple spaces with single space
        .replace(/\n{3,}/g, '\n\n')    // Replace 3+ newlines with 2
        .trim();

      // Skip pages with insufficient or malformed content
      if (text.length < 150 || text.includes('<iframe') || text.includes('GTM-')) {
        console.log(`Skipped (bad content): ${url}`);
        continue;
      }

      // Limit text to 3000 characters to keep chunk sizes reasonable
      text = text.slice(0, 3000);

      console.log(`Fetched ${text.length} chars from: ${url}`);
      console.log(`Preview: ${text.slice(0, 120).replace(/\n/g, ' ')}`);

      /*
      Enrich the text with event-specific prefix
      This improves search matching when users ask about events
      The prefix makes queries like "what events are happening" match better
      */
      const enrichedText = `CSUCI upcoming events and announcements:\n\n${text}`;
      
      // Generate embedding and save to database
      const embedding = await getEmbedding(enrichedText);
      await db.query(
        `INSERT INTO csuci_chunks (url, title, content, embedding) VALUES ($1, $2, $3, $4)`, 
        [url, `CSUCI Events and Announcements`, enrichedText, JSON.stringify(embedding)]
      );
      
      saved++;

    } catch (err) {
      console.log(`Error fetching ${url}: ${err.message}`);
    }
  }

  console.log(`\nEvents refresh complete. ${saved}/${EVENT_URLS.length} pages saved.`);
}

/*
================================================================================
DIRECT EXECUTION
================================================================================
Only run this block when the file is executed directly from the terminal
When imported by server.js, this block is skipped
*/
if (process.argv[1].includes('fetchEvents')) {
  fetchLatestEvents().then(() => db.end()).catch(err => {
    console.error('Fatal error:', err);
    db.end();
  });
}
