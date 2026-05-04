import 'dotenv/config';
import * as cheerio from 'cheerio';
import pg from 'pg';
import { pipeline } from '@xenova/transformers';
import pdfParse from 'pdf-parse-new';

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

async function getEmbedding(text) {
  const model = await loadEmbedder();
  const output = await model(text.slice(0, 8000), {
    pooling: 'mean',
    normalize: true
  });
  return Array.from(output.data);
}

function chunkText(text, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk.length > 50) chunks.push(chunk);
  }
  return chunks;
}

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

async function extractPdf(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EkhoBot/1.0 (CSUCI Capstone)' },
      signal: AbortSignal.timeout(15000),
    });
    const buffer = await res.arrayBuffer();

    // Silence pdf-parse noise
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
      // Always restore console even if parsing fails
      console.log = origLog;
      console.info = origInfo;
      console.warn = origWarn;
    }

    const text = data.text.replace(/\s+/g, ' ').trim();
    if (text.length < 50) return null;

    console.log(`  PDF read: ${text.length} chars from ${url.split('/').pop()}`);
    return text;

  } catch (err) {
    console.log(`  PDF failed (${url.split('/').pop()}): ${err.message}`);
    return null;
  }
}

const SEED_URLS = [
  // Main
  'https://www.csuci.edu/',
  'https://www.csuci.edu/about/',
  'https://www.csuci.edu/contact.htm',
  'https://www.csuci.edu/students/',
  'https://www.csuci.edu/student-life/',
  'https://www.csuci.edu/studentaffairs/',
  'https://www.csuci.edu/emergencyinfo/',
  'https://www.csuci.edu/titleix/',
  'https://www.csuci.edu/alumni/',
  'https://www.csuci.edu/parenting-students/index.htm',
  'https://www.csuci.edu/faculty/',
  'https://www.csuci.edu/staff/',

  // Admissions
  'https://www.csuci.edu/admissions/',
  'https://www.csuci.edu/admissions/freshman/',
  'https://www.csuci.edu/admissions/transfer/',
  'https://www.csuci.edu/admissions/graduate/',
  'https://www.csuci.edu/admissions/international/',
  'https://www.csuci.edu/admissions/apply-now.htm',
  'https://www.csuci.edu/admissions/tuition-and-aid/',
  'https://www.csuci.edu/visit-campus/',
  'https://www.csuci.edu/visit-campus/tours/index.htm',
  'https://www.csuci.edu/orientation/',
  'https://www.csuci.edu/orientation/nso-checklist.htm',

  // Academics
  'https://www.csuci.edu/academics/',
  'https://www.csuci.edu/academics/programs/',

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

  // Financial Aid
  'https://www.csuci.edu/financialaid/',
  'https://www.csuci.edu/financialaid/types/',
  'https://www.csuci.edu/financialaid/apply.htm',
  'https://www.csuci.edu/financialaid/deadlines.htm',
  'https://www.csuci.edu/financialaid/dream-act.htm',
  'https://www.csuci.edu/financialaid/satisfactory-academic-progress.htm',
  'https://www.csuci.edu/financialaid/verification.htm',
  'https://www.csuci.edu/financialaid/appeal.htm',
  'https://www.csuci.edu/financialaid/contact.htm',
  'https://www.csuci.edu/financialaid/faqs.htm',

  // Registrar
  'https://www.csuci.edu/registrar/',
  'https://www.csuci.edu/registrar/registration/',
  'https://www.csuci.edu/registrar/graduation/',
  'https://www.csuci.edu/registrar/transcripts.htm',
  'https://www.csuci.edu/registrar/enrollment-verification.htm',
  'https://www.csuci.edu/registrar/deadlines.htm',

  // Housing
  'https://www.csuci.edu/housing/',
  'https://www.csuci.edu/housing/apply.htm',
  'https://www.csuci.edu/housing/rates.htm',
  'https://www.csuci.edu/housing/meal-plans.htm',
  'https://www.csuci.edu/housing/accommodations-rates/parking-info.htm',

  // Student Services
  'https://www.csuci.edu/student-life/student-services/',
  'https://www.csuci.edu/caps/',
  'https://www.csuci.edu/dass/',
  'https://www.csuci.edu/eop/',
  'https://www.csuci.edu/careerdevelopment/',
  'https://www.csuci.edu/veterans/',
  'https://www.csuci.edu/basicneeds/index.htm',
  'https://www.csuci.edu/wpe/index.htm',
  'https://www.csuci.edu/cultural-centers/index.htm',
  'https://www.csuci.edu/international/',
  'https://www.csuci.edu/writing-ci/guide/',
  'https://www.csuci.edu/student-life/dining.htm',
  'https://www.csuci.edu/student-life/student-activities/',

  // Parking
  'https://www.csuci.edu/publicsafety/parking/',
  'https://www.csuci.edu/publicsafety/parking/Parking_Forms.htm',
  'https://www.csuci.edu/publicsafety/parking/faq.htm',

  // Library
  'https://library.csuci.edu',

  // Commencement & Events
  'https://www.csuci.edu/commencement/ceremony-info/index.htm',
  'https://www.csuci.edu/news/',
  'https://www.csuci.edu/giving/',
  'https://www.csuci.edu/careers/',
];

const MAX_PAGES = 500;
const CHUNK_SIZE = 800;

async function crawl() {
  const visited = new Set();
  const queue = [...SEED_URLS];
  let pageCount = 0;
  let chunkCount = 0;

  console.log('Clearing old data from database...');
  await db.query('DELETE FROM csuci_chunks');

  console.log(`Starting crawl of up to ${MAX_PAGES} pages...\n`);

  while (queue.length > 0 && pageCount < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    pageCount++;

    try {
      // Handle PDFs
      if (url.toLowerCase().endsWith('.pdf')) {
        // Skip old PDFs from 2015 and before
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
          console.log(`[${pageCount}] PDF — ${chunks.length} chunks saved: ${url}`);
        }
        continue;
      }

      // Fetch HTML page
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

      const chunks = chunkText(text);
      for (const chunk of chunks) {
        await saveChunk(url, title, chunk);
        chunkCount++;
      }

      console.log(`[${pageCount}] ${chunks.length} chunks — ${title.slice(0, 60)}`);

      // Find and queue internal links — single clean block
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        let fullUrl = '';

        if (href.startsWith('http') && href.includes('csuci.edu')) {
          fullUrl = href.split('#')[0].split('?')[0];
        } else if (href.startsWith('/') && !href.startsWith('//')) {
          fullUrl = 'https://www.csuci.edu' + href.split('#')[0].split('?')[0];
        }

        if (!fullUrl) return;

        const notVisited = !visited.has(fullUrl) && !queue.includes(fullUrl);
        const notJunk = !fullUrl.match(/\.(jpg|jpeg|png|gif|svg|zip|mp4|mp3|css|js|ico|webp)$/i);
        const notAuth = !fullUrl.match(/login|logout|signin|signout|sso|cas/i);

        if (notVisited && notJunk && notAuth) {
          const isImportant = fullUrl.match(/admissions|financialaid|housing|advising|counsel|parking|registrar|academics|student|financial|tuition|scholarship|grant|loan/i);
          if (isImportant) {
            queue.unshift(fullUrl); // important pages go to front
          } else {
            queue.push(fullUrl); // everything else goes to back
          }
        }
      });

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