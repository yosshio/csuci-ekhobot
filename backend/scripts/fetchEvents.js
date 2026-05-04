import 'dotenv/config';
import * as cheerio from 'cheerio';
import { pipeline } from '@xenova/transformers';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let embedder = null;
async function getEmbedding(text) {
  if (!embedder) {
    console.log('Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Pages with event text
const EVENT_URLS = [
  'https://www.csuci.edu/news/',
  'https://www.csuci.edu/commencement/ceremony-info/index.htm',
  'https://www.csuci.edu/orientation/',
  'https://www.csuci.edu/student-life/student-activities/',
  'https://www.csuci.edu/student-life/',
  'https://www.csuci.edu/admissions/tuition-and-aid/',

  // Individual news articles with event info
  'https://www.csuci.edu/news/releases/jsbl-workshops-202632.htm',
  'https://www.csuci.edu/news/releases/2026-csurf-students.htm',
  'https://www.csuci.edu/news/releases/20260219-womens-biz-conf.htm',
  'https://www.csuci.edu/news/releases/social-justice-conf-2026210.htm',
  'https://www.csuci.edu/news/releases/esbi-spring2026.htm',
  'https://www.csuci.edu/news/releases/blackhistorymonth-202602.htm',
];

export async function fetchLatestEvents() {
  console.log('Fetching latest CSUCI events...');

  // Remove old event data
  await db.query(`DELETE FROM csuci_chunks WHERE title LIKE 'EVENT:%'`);

  let saved = 0;

  // Automatically search news article links from the main news page
  try {
    const newsRes = await fetch('https://www.csuci.edu/news/', {
      headers: { 'User-Agent': 'EkhoBot/1.0' }
    });
    const newsHtml = await newsRes.text();
    const $news = cheerio.load(newsHtml);
    $news('a[href]').each((_, el) => {
    const href = $news(el).attr('href') || '';
    let fullUrl = '';
    if (href.startsWith('http')) {
      fullUrl = href; // already a full URL, use as is
    } else if (href.startsWith('/')) {
      fullUrl = 'https://www.csuci.edu' + href; // relative URL, add domain
    }
    if (fullUrl.includes('/news/releases/') && !EVENT_URLS.includes(fullUrl)) {
      EVENT_URLS.push(fullUrl);
    }
  });
    console.log(`Found ${EVENT_URLS.length} total pages to fetch`);
  } catch (e) {
    console.log('Could not auto-discover news articles');
  }

  for (const url of EVENT_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'EkhoBot/1.0 (CSUCI Capstone)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.log(`Skipped (${res.status}): ${url}`);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Remove all noise
      $('script, style, noscript, iframe, nav, footer, header').remove();
      $('[class*="cookie"], [class*="banner"], [class*="alert"], [id*="cookie"]').remove();
      $('[class*="nav"], [class*="menu"], [class*="sidebar"]').remove();

      // Try to get main content first, fall back to body
      let text = '';
      const main = $('main, #main, #main-content, .page-content, .content, article');
      if (main.length > 0) {
        text = main.text();
      } else {
        text = $('body').text();
      }

      // Clean whitespace
      text = text
        .replace(/\t/g, ' ')
        .replace(/ {2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      // Skip if content is too short or looks like raw HTML
      if (text.length < 150 || text.includes('<iframe') || text.includes('GTM-')) {
        console.log(`Skipped (bad content): ${url}`);
        continue;
      }

      // Take up to 3000 chars
      text = text.slice(0, 3000);

      console.log(`Fetched ${text.length} chars from: ${url}`);
      console.log(`Preview: ${text.slice(0, 120).replace(/\n/g, ' ')}`);

      const enrichedText = `CSUCI upcoming events and announcements:\n\n${text}`;
      const embedding = await getEmbedding(enrichedText);
      await db.query(`INSERT INTO csuci_chunks (url, title, content, embedding) VALUES ($1, $2, $3, $4)`, 
        [url, `CSUCI Events and Announcements`, enrichedText, JSON.stringify(embedding)]);
      saved++;

    } catch (err) {
      console.log(`Error fetching ${url}: ${err.message}`);
    }
  }

  console.log(`\nEvents refresh complete. ${saved}/${EVENT_URLS.length} pages saved.`);
}

// Only run directly if called from terminal not when imported
if (process.argv[1].includes('fetchEvents')) {
  fetchLatestEvents().then(() => db.end()).catch(err => {
    console.error('Fatal error:', err);
    db.end();
  });
}