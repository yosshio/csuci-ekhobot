import 'dotenv/config';
import * as cheerio from 'cheerio';
import { createRequire } from 'module';
import { HfInference } from '@huggingface/inference';
import pg from 'pg';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const SEED_URLS = [
  // Main pages
  'https://www.csuci.edu/',
  'https://www.csuci.edu/about/',
  'https://www.csuci.edu/about/mission.htm',
  'https://www.csuci.edu/about/facts.htm',
  'https://www.csuci.edu/about/administration/',
  'https://www.csuci.edu/about/accreditation.htm',

  // Admissions
  'https://www.csuci.edu/admissions/',
  'https://www.csuci.edu/admissions/freshman/',
  'https://www.csuci.edu/admissions/transfer/',
  'https://www.csuci.edu/admissions/graduate/',
  'https://www.csuci.edu/admissions/international/',
  'https://www.csuci.edu/admissions/returning/',
  'https://www.csuci.edu/admissions/second-baccalaureate/',
  'https://www.csuci.edu/admissions/apply.htm',
  'https://www.csuci.edu/admissions/contact.htm',
  'https://www.csuci.edu/admissions/deadlines.htm',
  'https://www.csuci.edu/admissions/requirements.htm',
  'https://www.csuci.edu/admissions/impacted-programs.htm',
  'https://www.csuci.edu/admissions/visit.htm',
  'https://www.csuci.edu/admissions/waitlist.htm',

  // Financial Aid
  'https://www.csuci.edu/financialaid/',
  'https://www.csuci.edu/financialaid/types/',
  'https://www.csuci.edu/financialaid/types/grants.htm',
  'https://www.csuci.edu/financialaid/types/loans.htm',
  'https://www.csuci.edu/financialaid/types/scholarships.htm',
  'https://www.csuci.edu/financialaid/types/work-study.htm',
  'https://www.csuci.edu/financialaid/apply.htm',
  'https://www.csuci.edu/financialaid/deadlines.htm',
  'https://www.csuci.edu/financialaid/disbursement.htm',
  'https://www.csuci.edu/financialaid/satisfactory-academic-progress.htm',
  'https://www.csuci.edu/financialaid/verification.htm',
  'https://www.csuci.edu/financialaid/appeal.htm',
  'https://www.csuci.edu/financialaid/dream-act.htm',
  'https://www.csuci.edu/financialaid/contact.htm',
  'https://www.csuci.edu/financialaid/faqs.htm',

  // Academics
  'https://www.csuci.edu/academics/',
  'https://www.csuci.edu/academics/programs/',
  'https://www.csuci.edu/academics/undergraduate/',
  'https://www.csuci.edu/academics/graduate/',
  'https://www.csuci.edu/academics/online/',
  'https://www.csuci.edu/academics/minors/',
  'https://www.csuci.edu/academics/certificates/',
  'https://www.csuci.edu/academics/catalog/',
  'https://www.csuci.edu/academics/schedule/',
  'https://www.csuci.edu/academics/calendar/',
  'https://www.csuci.edu/academics/honors/',

  // Schools and Programs
  'https://www.csuci.edu/academics/schools/arts-sciences/',
  'https://www.csuci.edu/academics/schools/business/',
  'https://www.csuci.edu/academics/schools/education/',
  'https://www.csuci.edu/academics/schools/nursing/',
  'https://www.csuci.edu/computerscienceandengineering/',
  'https://www.csuci.edu/psychology/',
  'https://www.csuci.edu/biology/',
  'https://www.csuci.edu/mathematics/',
  'https://www.csuci.edu/english/',
  'https://www.csuci.edu/history/',
  'https://www.csuci.edu/politicalscience/',
  'https://www.csuci.edu/sociology/',
  'https://www.csuci.edu/communicationsandmedia/',
  'https://www.csuci.edu/childadolescentdevelopment/',
  'https://www.csuci.edu/environmentalscience/',

  // Academic Advising
  'https://www.csuci.edu/advising/',
  'https://www.csuci.edu/advising/appointment.htm',
  'https://www.csuci.edu/advising/degree-planning.htm',
  'https://www.csuci.edu/advising/general-education.htm',
  'https://www.csuci.edu/advising/graduation.htm',
  'https://www.csuci.edu/advising/transfer-credit.htm',
  'https://www.csuci.edu/advising/faq.htm',

  // Registrar
  'https://www.csuci.edu/registrar/',
  'https://www.csuci.edu/registrar/registration/',
  'https://www.csuci.edu/registrar/records/',
  'https://www.csuci.edu/registrar/graduation/',
  'https://www.csuci.edu/registrar/transcripts.htm',
  'https://www.csuci.edu/registrar/enrollment-verification.htm',
  'https://www.csuci.edu/registrar/add-drop.htm',
  'https://www.csuci.edu/registrar/withdrawal.htm',
  'https://www.csuci.edu/registrar/grading.htm',
  'https://www.csuci.edu/registrar/deadlines.htm',
  'https://www.csuci.edu/registrar/contact.htm',

  // Housing
  'https://www.csuci.edu/housing/',
  'https://www.csuci.edu/housing/apply.htm',
  'https://www.csuci.edu/housing/rates.htm',
  'https://www.csuci.edu/housing/meal-plans.htm',
  'https://www.csuci.edu/housing/roommates.htm',
  'https://www.csuci.edu/housing/move-in.htm',
  'https://www.csuci.edu/housing/policies.htm',
  'https://www.csuci.edu/housing/maintenance.htm',
  'https://www.csuci.edu/housing/contact.htm',
  'https://www.csuci.edu/housing/faq.htm',

  // Student Life
  'https://www.csuci.edu/studentlife/',
  'https://www.csuci.edu/studentlife/clubs/',
  'https://www.csuci.edu/studentlife/government/',
  'https://www.csuci.edu/studentlife/orientation/',
  'https://www.csuci.edu/studentlife/commencement/',
  'https://www.csuci.edu/studentlife/recreation/',
  'https://www.csuci.edu/studentlife/dining/',
  'https://www.csuci.edu/studentlife/events/',

  // Student Services
  'https://www.csuci.edu/studentaffairs/',
  'https://www.csuci.edu/counseling/',
  'https://www.csuci.edu/counseling/appointments.htm',
  'https://www.csuci.edu/counseling/crisis.htm',
  'https://www.csuci.edu/counseling/services.htm',
  'https://www.csuci.edu/counseling/contact.htm',
  'https://www.csuci.edu/healthcenter/',
  'https://www.csuci.edu/healthcenter/services.htm',
  'https://www.csuci.edu/healthcenter/appointments.htm',
  'https://www.csuci.edu/healthcenter/contact.htm',
  'https://www.csuci.edu/disabilityaccommodationservices/',
  'https://www.csuci.edu/disabilityaccommodationservices/services.htm',
  'https://www.csuci.edu/disabilityaccommodationservices/contact.htm',
  'https://www.csuci.edu/basicneeds/',
  'https://www.csuci.edu/basicneeds/foodpantry.htm',
  'https://www.csuci.edu/dreamers/',
  'https://www.csuci.edu/veterans/',
  'https://www.csuci.edu/veterans/services.htm',
  'https://www.csuci.edu/international/',
  'https://www.csuci.edu/international/services.htm',
  'https://www.csuci.edu/lgbtq/',
  'https://www.csuci.edu/eop/',
  'https://www.csuci.edu/tutoring/',
  'https://www.csuci.edu/writingcenter/',
  'https://www.csuci.edu/mathresourcecenter/',

  // Career Services
  'https://www.csuci.edu/careerservices/',
  'https://www.csuci.edu/careerservices/students/',
  'https://www.csuci.edu/careerservices/internships.htm',
  'https://www.csuci.edu/careerservices/jobs.htm',
  'https://www.csuci.edu/careerservices/contact.htm',

  // Library
  'https://www.csuci.edu/library/',
  'https://www.csuci.edu/library/hours.htm',
  'https://www.csuci.edu/library/services/',
  'https://www.csuci.edu/library/contact.htm',

  // IT
  'https://www.csuci.edu/it/',
  'https://www.csuci.edu/it/services/',
  'https://www.csuci.edu/it/helpdesk.htm',
  'https://www.csuci.edu/it/contact.htm',
  'https://www.csuci.edu/it/wifi.htm',
  'https://www.csuci.edu/it/software.htm',

  // Parking
  'https://www.csuci.edu/parking/',
  'https://www.csuci.edu/parking/permits.htm',
  'https://www.csuci.edu/parking/visitor.htm',
  'https://www.csuci.edu/parking/citations.htm',
  'https://www.csuci.edu/parking/map.htm',
  'https://www.csuci.edu/parking/contact.htm',

  // Research
  'https://www.csuci.edu/research/',
  'https://www.csuci.edu/research/undergraduate/',
  'https://www.csuci.edu/research/opportunities.htm',

  // Study Abroad
  'https://www.csuci.edu/studyabroad/',
  'https://www.csuci.edu/studyabroad/programs.htm',
  'https://www.csuci.edu/studyabroad/apply.htm',

  // Campus Police
  'https://www.csuci.edu/police/',
  'https://www.csuci.edu/police/contact.htm',
  'https://www.csuci.edu/police/services.htm',
  'https://www.csuci.edu/police/clery.htm',

  // Tuition and Fees
  'https://www.csuci.edu/studentbusiness/',
  'https://www.csuci.edu/studentbusiness/tuition.htm',
  'https://www.csuci.edu/studentbusiness/fees.htm',
  'https://www.csuci.edu/studentbusiness/payment.htm',
  'https://www.csuci.edu/studentbusiness/refunds.htm',
  'https://www.csuci.edu/studentbusiness/contact.htm',

  // Human Resources (for staff contact info)
  'https://www.csuci.edu/hr/',
  'https://www.csuci.edu/hr/contact.htm',

  // News and Events
  'https://www.csuci.edu/news/',
  'https://www.csuci.edu/events/',
];

const MAX_PAGES = 300;
const CHUNK_SIZE = 500;

// --- Embedding using Hugging Face (free, no OpenAI needed) ---
async function getEmbedding(text) {
  const result = await hf.featureExtraction({
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    inputs: text.slice(0, 8000),
  });
  return Array.from(result);
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