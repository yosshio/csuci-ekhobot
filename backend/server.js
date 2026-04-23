import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin.startsWith('http://localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// Pages to start crawling from
const SEED_URLS = [
  'https://www.csuci.edu/admissions/',
  'https://www.csuci.edu/financialaid/',
  'https://www.csuci.edu/housing/',
  'https://www.csuci.edu/academics/',
  'https://www.csuci.edu/studentlife/',
  'https://www.csuci.edu/campuslife/',

  'https://www.csuci.edu/learningresourcecenter/',
  'https://www.csuci.edu/events/',
  'https://www.csuci.edu/advising/'
];

const MAX_PAGES = 50;       // how many pages to crawl total
const MAX_TEXT_PER_PAGE = 1500; // characters per page to keep
const CRAWL_DELAY_MS = 300; // delay between requests

let siteContext = '';
let crawlComplete = false;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function crawlSite() {
  console.log('Starting CSUCI site crawl...');
  const visited = new Set();
  const queue = [...SEED_URLS];
  const chunks = [];

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      console.log(`Crawling (${visited.size}/${MAX_PAGES}): ${url}`);
      const res = await fetch(url, {
        headers: { 'User-Agent': 'EkhoBot/1.0 (CSUCI Capstone Research Bot)' }
      });

      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Remove noise
      $('nav, footer, script, style, header, .menu, .navigation, .breadcrumb, .sidebar').remove();

      // Extract clean text
      const text = $('main, .content, .page-content, body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT_PER_PAGE);

      if (text.length > 100) {
        chunks.push(`[PAGE: ${url}]\n${text}`);
      }

      // Find internal links and queue them
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        let fullUrl = '';
        if (href.startsWith('http') && href.includes('csuci.edu')) {
          fullUrl = href.split('#')[0]; // remove anchors
        } else if (href.startsWith('/') && !href.startsWith('//')) {
          fullUrl = 'https://www.csuci.edu' + href.split('#')[0];
        }

        // Skip non-content URLs
        if (
          fullUrl &&
          !visited.has(fullUrl) &&
          !queue.includes(fullUrl) &&
          !fullUrl.match(/\.(pdf|jpg|png|gif|zip|doc|docx|ppt|mp4|css|js)$/i) &&
          !fullUrl.includes('mailto:') &&
          !fullUrl.includes('tel:') &&
          !fullUrl.includes('login') &&
          !fullUrl.includes('logout')
        ) {
          queue.push(fullUrl);
        }
      });

      await sleep(CRAWL_DELAY_MS);

    } catch (err) {
      console.log(`Could not crawl ${url}:`, err.message);
    }
  }

  siteContext = chunks.join('\n\n---\n\n');
  crawlComplete = true;
  console.log(`Crawl complete. ${visited.size} pages crawled, ${chunks.length} pages with content.`);
  console.log(`Total context: ${siteContext.length} characters`);
}

// Start crawling when server starts
crawlSite();

const SYSTEM_PROMPT = `You are EkhoBot, the friendly virtual assistant for 
CSU Channel Islands (CSUCI) — named after the school's dolphin mascot, Ekho.

You help students, parents, and visitors with admissions, financial aid, 
campus events, housing, academic programs, departments, and general FAQs.

You have been given real content crawled directly from the CSUCI website.
Always use this content to give accurate, specific answers.
If the content does not cover the question, say so and direct to www.csuci.edu or (805) 437-8400.

CRITICAL RULES:
- Keep every response to 2-3 sentences maximum.
- NEVER list options or bullet points. The UI already shows buttons for navigation.
- Answer the specific question directly and concisely.
- Never make up phone numbers, emails, dates, or staff names not found in the content.
- Warm and helpful tone, always brief.`;

app.post('/chat', async (req, res) => {
  const { messages } = req.body;

  // If still crawling, let the user know
  if (!crawlComplete) {
    return res.json({
      reply: "I'm still loading CSUCI information, give me just a moment and try again!"
    });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `${SYSTEM_PROMPT}\n\nCSUCI WEBSITE CONTENT:\n${siteContext}`,
      messages,
    });
    res.json({ reply: response.content[0].text });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: 'EkhoBot hit a wave — try again!' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: crawlComplete ? 'ready' : 'crawling',
    pages: crawlComplete ? 'loaded' : 'loading'
  });
});

app.listen(3000, () => console.log('EkhoBot backend running at http://localhost:3000'));