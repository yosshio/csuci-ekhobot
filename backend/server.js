/*
================================================================================
EKHOBOT EXPRESS SERVER
================================================================================
Main backend server for EkhoBot chatbot.

Features:
  - Vector search using pgvector for semantic matching
  - Claude AI API for natural language responses
  - Brave Search fallback when database has no relevant content
  - Nightly event refresh via cron
  - Alert system for campus notifications

Endpoints:
  POST /chat         - Main chatbot endpoint
  GET  /alert        - Get current alert message
  POST /alert        - Set alert message (requires key)
  GET  /health       - Health check

Port: 3000
================================================================================
*/

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { pipeline } from '@xenova/transformers';
import pg from 'pg';
import cron from 'node-cron';
import { fetchLatestEvents } from './scripts/fetchEvents.js';

/*
================================================================================
INITIALIZATION
================================================================================
*/

// Validate required environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in .env file');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set in .env file');
  process.exit(1);
}

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

// Connect to database with error handling
try {
  await db.connect();
  console.log('Database connected successfully');
} catch (err) {
  console.error('Database connection failed:', err.message);
  process.exit(1);
}

/*
================================================================================
CONFIGURATION
================================================================================
*/

// Minimum similarity score to use database results (0.0 to 1.0)
// Below this threshold, fallback to web search
const SIMILARITY_THRESHOLD = 0.15;

// Number of database chunks to retrieve for context
const TOP_K = 5;

/*
================================================================================
EVENT REFRESH SCHEDULING
================================================================================
*/

// Fetch events immediately when server starts
console.log('Fetching latest events on startup...');
fetchLatestEvents().catch(err => 
  console.log('Initial event fetch failed:', err.message)
);

// Schedule nightly refresh at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Nightly event refresh starting...');
  await fetchLatestEvents().catch(err => 
    console.log('Nightly fetch failed:', err.message)
  );
});

/*
================================================================================
MIDDLEWARE
================================================================================
*/

// CORS configuration - allows localhost requests for development
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    // or requests from localhost
    if (!origin || origin.startsWith('http://localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

/*
================================================================================
EMBEDDING MODEL
================================================================================
Local AI model for converting text queries into vectors
Same model used by crawler and event fetcher for consistency
*/

let embedder = null;

/*
FUNCTION: loadEmbedder
PURPOSE: Load and cache the embedding model
RETURNS: The loaded pipeline
*/
async function loadEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Embedding model ready.');
  }
  return embedder;
}

/*
FUNCTION: getEmbedding
PURPOSE: Convert text into 384-dimensional vector
PARAMETERS: text (string)
RETURNS: Array of 384 numbers
*/
async function getEmbedding(text) {
  const model = await loadEmbedder();
  
  // Limit to 8000 chars to avoid model limits
  const output = await model(text.slice(0, 8000), {
    pooling: 'mean',
    normalize: true,
  });
  
  return Array.from(output.data);
}

// Pre-load model on startup to avoid first-request delay
loadEmbedder();

/*
================================================================================
VECTOR SEARCH
================================================================================
*/

/*
FUNCTION: searchChunks
PURPOSE: Search database for content relevant to user query
PARAMETERS: query (string) - User's question
RETURNS: Array of matching chunks with similarity scores

Process:
  1. Enrich query with domain-specific keywords for better matching
  2. Convert query to vector embedding
  3. Find top K most similar chunks using cosine similarity
  4. Return chunks sorted by similarity score
*/
async function searchChunks(query) {
  const lowerQuery = query.toLowerCase();

  /*
  Query enrichment: Add context-specific prefixes to improve matching
  This helps the embedding model understand the domain of the question
  */
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

  // Convert enriched query to vector embedding
  const embedding = await getEmbedding(enrichedQuery);

  /*
  Vector similarity search using pgvector
  The <=> operator computes cosine distance between vectors
  We compute similarity as 1 - distance (higher = more similar)
  Results are ordered by distance (ascending = most similar first)
  */
  const result = await db.query(
    `SELECT content, url, title,
     1 - (embedding::vector <=> $1::vector) as similarity
     FROM csuci_chunks
     ORDER BY embedding::vector <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(embedding), TOP_K]
  );

  // Log top match scores for debugging
  console.log('Top matches:', result.rows.map(r => ({
    score: r.similarity.toFixed(3),
    title: r.title?.slice(0, 50)
  })));

  return result.rows;
}

/*
================================================================================
WEB SEARCH FALLBACK
================================================================================
*/

/*
FUNCTION: webSearchFallback
PURPOSE: Use Brave Search API when database has no relevant results
PARAMETERS: query (string)
RETURNS: Formatted search results or empty string if failed

This fallback ensures EkhoBot can answer questions even if the content
was not crawled or indexed in the database.
*/
async function webSearchFallback(query) {
  if (!process.env.BRAVE_SEARCH_KEY) {
    console.log('No Brave Search key configured');
    return '';
  }
  
  try {
    // Search for "CSUCI [query]" to get campus-specific results
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent('CSUCI ' + query)}&count=3`,
      { headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_KEY } }
    );
    
    const data = await res.json();
    
    // Format results as title + description
    return data.web?.results?.map(r => `${r.title}: ${r.description}`).join('\n') || '';
    
  } catch (e) {
    console.log('Web search fallback failed:', e.message);
    return '';
  }
}

/*
================================================================================
SYSTEM PROMPT
================================================================================
Instructions for Claude AI on how to respond as EkhoBot
Includes formatting rules, contact info, and critical facts
*/

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

/*
================================================================================
ALERT SYSTEM
================================================================================
Allows administrators to set campus-wide alerts (power outages, closures, etc)
*/

let currentAlert = '';

/*
ENDPOINT: GET /alert
PURPOSE: Retrieve current alert message for display in chat widget
RETURNS: { alert: string }
*/
app.get('/alert', (req, res) => {
  res.json({ alert: currentAlert });
});

/*
ENDPOINT: POST /alert
PURPOSE: Set or clear campus alert (requires authentication)
BODY: { message: string, key: string }
RETURNS: { alert: string } or 401 error
*/
app.post('/alert', (req, res) => {
  const { message, key } = req.body;
  
  // Verify admin key
  if (key !== process.env.ALERT_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Set or clear alert
  currentAlert = message || '';
  console.log('Alert updated:', currentAlert || '(cleared)');
  
  res.json({ alert: currentAlert });
});

/*
================================================================================
CHAT ENDPOINT
================================================================================
Main chatbot endpoint that processes user questions
*/

/*
ENDPOINT: POST /chat
PURPOSE: Process user message and return AI response
BODY: { messages: Array<{role: string, content: string}> }
RETURNS: { reply: string } or error

Process:
  1. Extract last user message
  2. Search database for relevant chunks
  3. Use web search if similarity score is too low
  4. Send context + message history to Claude AI
  5. Return AI response
*/
app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  const lastMessage = messages[messages.length - 1].content;

  try {
    // Search database for relevant content
    const chunks = await searchChunks(lastMessage);
    const bestScore = chunks[0]?.similarity || 0;

    let context = '';
    let source = 'database';

    /*
    Decide whether to use database results or web search fallback
    If best match is above threshold, use database
    Otherwise fall back to web search
    */
    if (bestScore >= SIMILARITY_THRESHOLD) {
      /*
      Filter out low-quality chunks:
      - Spanish OCR artifacts (Descargue, Escanee)
      - Google Tag Manager code
      - iframes and embedded content
      - Very short chunks
      */
      const goodChunks = chunks.filter(c =>
        c.content &&
        !c.content.includes('Descargue') &&
        !c.content.includes('Escanee') &&
        !c.content.includes('GTM-') &&
        !c.content.includes('<iframe') &&
        c.content.length > 100
      );
      
      // Use filtered chunks if available, otherwise use all chunks
      const useChunks = goodChunks.length > 0 ? goodChunks : chunks;
      
      // Format context with source URLs
      context = useChunks
        .map(c => `[Source: ${c.url}]\n${c.content}`)
        .join('\n\n');
        
      console.log(`DB match (${bestScore.toFixed(2)}): "${lastMessage.slice(0, 50)}"`);
      
    } else {
      // Low similarity - use web search instead
      console.log(`Low similarity (${bestScore.toFixed(2)}) — using web search for: "${lastMessage.slice(0, 50)}"`);
      context = await webSearchFallback(lastMessage);
      source = 'web search';
    }

    console.log('Context being sent to Claude:', context.slice(0, 300));

    /*
    Call Claude AI with system prompt + context + conversation history
    The system prompt includes instructions and contact info
    The context provides relevant content to answer from
    */
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,  // Keep responses concise
      system: `${SYSTEM_PROMPT}\n\nCSUCI CONTEXT (from ${source}) — USE THIS CONTENT TO ANSWER, DO NOT IGNORE IT:\n${context}`,
      messages,
    });

    res.json({ reply: response.content[0].text });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'EkhoBot hit a wave — try again!' });
  }
});

/*
================================================================================
HEALTH CHECK
================================================================================
*/

/*
ENDPOINT: GET /health
PURPOSE: Simple health check for monitoring
RETURNS: { status: 'ready' }
*/
app.get('/health', (req, res) => {
  res.json({ status: 'ready' });
});

/*
================================================================================
START SERVER
================================================================================
*/

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`EkhoBot backend running at http://localhost:${PORT}`);
  console.log('Ready to answer questions about CSUCI!');
});
