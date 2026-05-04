import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { pipeline } from '@xenova/transformers';
import pg from 'pg';
import cron from 'node-cron';
import { fetchLatestEvents } from './scripts/fetchEvents.js';

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const SIMILARITY_THRESHOLD = 0.15;
const TOP_K = 5;

// Fetch events immediately on startup
fetchLatestEvents().catch(err => console.log('Initial event fetch failed:', err.message));

// Refresh every night at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Nightly event refresh starting...');
  await fetchLatestEvents().catch(err => console.log('Nightly fetch failed:', err.message));
});

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

// --- Local embedding model ---
let embedder = null;
async function loadEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Embedding model ready.');
  }
  return embedder;
}

async function getEmbedding(text) {
  const model = await loadEmbedder();
  const output = await model(text.slice(0, 8000), {
    pooling: 'mean',
    normalize: true,
  });
  return Array.from(output.data);
}

loadEmbedder();

// --- Search the vector database ---
async function searchChunks(query) {
  const lowerQuery = query.toLowerCase();

  let enrichedQuery = query;
  if (lowerQuery.match(/event|happening|coming up|calendar|schedule|activities|workshop|conference|fair|ceremony/)) {
    enrichedQuery = `CSUCI upcoming events and announcements: ${query}`;
  } else if (lowerQuery.match(/advis|degree|major|graduation|add|drop|ge|units/)) {
    enrichedQuery = `CSUCI academic advising: ${query}`;
  } else if (lowerQuery.match(/counsel|mental health|anxiety|stress|therapy|wellness/)) {
    enrichedQuery = `CSUCI counseling and mental health services: ${query}`;
  } else if (lowerQuery.match(/park|permit|lot|visitor|citation/)) {
    enrichedQuery = `CSUCI parking and transportation: ${query}`;
  } else if (lowerQuery.match(/financ|fafsa|aid|scholarship|grant|loan|tuition/)) {
    enrichedQuery = `CSUCI financial aid and tuition: ${query}`;
  } else if (lowerQuery.match(/hous|dorm|room|meal|dining/)) {
    enrichedQuery = `CSUCI student housing: ${query}`;
  } else if (lowerQuery.match(/admission|apply|transfer|enroll/)) {
    enrichedQuery = `CSUCI admissions and applying: ${query}`;
  }

  const embedding = await getEmbedding(enrichedQuery);

  const result = await db.query(
    `SELECT content, url, title,
     1 - (embedding::vector <=> $1::vector) as similarity
     FROM csuci_chunks
     ORDER BY embedding::vector <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(embedding), TOP_K]
  );

  console.log('Top matches:', result.rows.map(r => ({
    score: r.similarity.toFixed(3),
    title: r.title?.slice(0, 50)
  })));

  return result.rows;
}

// --- Brave Search fallback ---
async function webSearchFallback(query) {
  if (!process.env.BRAVE_SEARCH_KEY) return '';
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent('CSUCI ' + query)}&count=3`,
      { headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_KEY } }
    );
    const data = await res.json();
    return data.web?.results?.map(r => `${r.title}: ${r.description}`).join('\n') || '';
  } catch (e) {
    console.log('Web search fallback failed:', e.message);
    return '';
  }
}

const SYSTEM_PROMPT = `You are EkhoBot, the virtual assistant for CSU Channel Islands (CSUCI).
Answer using the context provided. Be helpful, direct, and always include useful details.

FORMATTING RULES:
- Keep answers to 2-4 sentences max.
- Ask before providing a phone number, email, link, or office location when relevant.
- Put each piece of contact info or URLs on its own line using a newline character.
- Never say "I don't have that information" — always direct to a specific resource.
- Never use bullet points or dashes. Use plain sentences and line breaks only.
- If the user writes in Spanish, respond in Spanish using the same formatting rules.
- Always include the same contact info, links and phone numbers regardless of language.

EXAMPLE of a good response to "How do I contact Financial Aid?":
You can reach the Financial Aid Office by phone or email during business hours.

Phone: (805) 437-8530
Email: financialaid@csuci.edu
Website: csuci.edu/financialaid
Office: Sage Hall 1100, Mon-Fri 8am-5pm
Campus Map: https://maps.csuci.edu/

CRITICAL CSUCI FACTS — always use these when relevant:
- Main campus phone: (805) 437-8400
- Campus address: 1 University Dr., Camarillo, CA 93012
- Admissions: (805) 437-8520 | admissions@csuci.edu
- Financial Aid: (805) 437-8530 | financialaid@csuci.edu
- Registrar: (805) 437-8500 | registrar@csuci.edu
- Programs: https://www.csuci.edu/academics/
- Parking Services: (805) 437-8430 | parking@csuci.edu
- IT Help Desk: (805) 437-8552 | ithelp@csuci.edu
- Counseling (CAPS): (805) 437-2088 | caps@csuci.edu
- Student Health: (805) 437-8820
- Campus Police: (805) 437-8444
- Housing: (805) 437-8500 | housing@csuci.edu
- Career Development: (805) 437-8557
- Library: (805) 437-8634
- Parking permits: csuci.edu/publicsafety/parking/
- Parking purchase: Visit csuci.edu/publicsafety/parking/ and click Get My Permit, log in with myCI credentials
- Daily parking permit: $6 at dispensers in Lots A1, A2, A3, A4
- Academic Advising: csuci.edu/advising | (805) 437-8500
- Apply to CSUCI: csuci.edu/admissions/apply-now.htm
- Financial aid apply: csuci.edu/financialaid
- Housing apply: csuci.edu/housing
- Tuition info: csuci.edu/admissions/tuition-and-aid
- Basic Needs / Food Pantry: csuci.edu/basicneeds
- Campus map: maps.csuci.edu
- Events: csuci.edu/events/index.htm | events@csuci.edu | (805) 437-3900
- CSUCI Social Media:
  Instagram: @csuci -> instagram.com/csuci
  Twitter/X: @csuci -> twitter.com/csuci
  Facebook: CSU Channel Islands -> facebook.com/CSUChannelIslands
  YouTube: youtube.com/user/ciwatch
  Pinterest: pinterest.com/csuci
  Social directory: csuci.edu/news/social`;

// --- Alert system ---
let currentAlert = '';

app.get('/alert', (req, res) => {
  res.json({ alert: currentAlert });
});

app.post('/alert', (req, res) => {
  const { message, key } = req.body;
  if (key !== process.env.ALERT_KEY) return res.status(401).json({ error: 'Unauthorized' });
  currentAlert = message || '';
  console.log('Alert updated:', currentAlert);
  res.json({ alert: currentAlert });
});

app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  const lastMessage = messages[messages.length - 1].content;

  try {
    const chunks = await searchChunks(lastMessage);
    const bestScore = chunks[0]?.similarity || 0;

    let context = '';
    let source = 'database';

    if (bestScore >= SIMILARITY_THRESHOLD) {
      const goodChunks = chunks.filter(c =>
        c.content &&
        !c.content.includes('Descargue') &&
        !c.content.includes('Escanee') &&
        !c.content.includes('GTM-') &&
        !c.content.includes('<iframe') &&
        c.content.length > 100
      );
      const useChunks = goodChunks.length > 0 ? goodChunks : chunks;
      context = useChunks
        .map(c => `[Source: ${c.url}]\n${c.content}`)
        .join('\n\n');
      console.log(`DB match (${bestScore.toFixed(2)}): "${lastMessage.slice(0, 50)}"`);
    } else {
      console.log(`Low similarity (${bestScore.toFixed(2)}) — using web search for: "${lastMessage.slice(0, 50)}"`);
      context = await webSearchFallback(lastMessage);
      source = 'web search';
    }

    console.log('Context being sent to Claude:', context.slice(0, 300));

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `${SYSTEM_PROMPT}\n\nCSUCI CONTEXT (from ${source}) — USE THIS CONTENT TO ANSWER, DO NOT IGNORE IT:\n${context}`,
      messages,
    });

    res.json({ reply: response.content[0].text });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'EkhoBot hit a wave — try again!' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ready' });
});

app.listen(3000, () => console.log('EkhoBot backend running at http://localhost:3000'));