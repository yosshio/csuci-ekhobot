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
================================================================================
*/

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { pipeline } from '@xenova/transformers';
import pg from 'pg';
import cron from 'node-cron';
import { fetchLatestEvents, fetchServiceStatus } from './scripts/fetchEvents.js';

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
// Below threshold will fallback to web search
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

// Fetch service status on startup
fetchServiceStatus().catch(err =>
  console.log('Initial status fetch failed:', err.message)
);

// Schedule nightly refresh at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Nightly event refresh starting...');
  await fetchLatestEvents().catch(err => 
    console.log('Nightly fetch failed:', err.message)
  );
});

// Refresh service status every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  await fetchServiceStatus();
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
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin === 'null') {
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
PURPOSE: Convert text into 384 dimensional vector
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

// Pre load model on startup to avoid first request delay
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
  Query enrichment: Add context specific prefixes to improve matching
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
  }  else if (lowerQuery.match(/canvas|myci|zoom|slack|teams|outlook|email|microsoft|google|service|down|outage|working|status|maintenance/)) {
    enrichedQuery = `CSUCI service status: ${query}`;
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

**BRAVE API DOES NOT CURRENTLY HAVE ANY CREDITS AND THEREFORE IS NOT IN USE**
*/
async function webSearchFallback(query) {
  if (!process.env.BRAVE_SEARCH_KEY) {
    console.log('No Brave Search key configured');
    return '';
  }
  
  try {
    // Search for "CSUCI [query]" to get campus specific results
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
Answer using the context provided. Be fun, friendly, helpful, adding concise.

RULES:
- Keep responses short (2-4 sentences) no special characters(*), but provide info when prompted instead of just directing to a link.
- Put each phone number, email, and URL on its own line. Do not provide links that do not work.
- Never say "I don't have that information" - always point to a resource.
- Match the user's language in your response.
- For service issues (Canvas, myCI, CILearn, etc.) always include the current status from context, the full status page link, 
  and IT Help Desk contact. Mention what is affected, what the current status is, and when to expect updates if available.

  CONTACTS:
Main: (805) 437-8400 | 1 University Dr., Camarillo, CA 93012
Admissions: (805) 437-8520 | admissions@csuci.edu | csuci.edu/admissions/apply-now.htm
Financial Aid: (805) 437-8530 | financialaid@csuci.edu | csuci.edu/financialaid
Registrar: (805) 437-8500 | registrar@csuci.edu
Advising: (805) 437-8500 | csuci.edu/advising
Counseling: (805) 437-2088 | caps@csuci.edu
Student Health: (805) 437-8820
Housing: (805) 437-8500 | housing@csuci.edu | csuci.edu/housing
Parking: (805) 437-8430 | parking@csuci.edu | csuci.edu/publicsafety/parking/
IT Help Desk: (805) 437-8552 | ithelp@csuci.edu
Campus Police: (805) 437-8444
Library: (805) 437-8634
Career: (805) 437-8557
Basic Needs: csuci.edu/basicneeds
Events: (805) 437-3900 | events@csuci.edu | csuci.edu/events/index.htm
Programs: csuci.edu/academics
Tuition: csuci.edu/admissions/tuition-and-aid
Campus Map: maps.csuci.edu
Social: instagram.com/csuci | twitter.com/csuci | facebook.com/CSUChannelIslands
Service Status: ciapps.csuci.edu/status

PARKING NOTES:
Daily permit $6 at dispensers in Lots A1-A4. Purchase at csuci.edu/publicsafety/parking/ → Get My Permit.`;

/*
================================================================================
ALERT SYSTEM
================================================================================
Allows administrators to set campus wide alerts (power outages, closures, lion sightings???, etc)
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
    // if asking about service status, always pull the status chunk too
    const isStatusQuery = lastMessage.toLowerCase().match(/canvas|myci|cilearn|zoom|slack|teams|down|outage|working|status|maintenance/);
    if (isStatusQuery) {
      const statusResult = await db.query(
        `SELECT content, url, title FROM csuci_chunks WHERE title = 'CSUCI Service Status' LIMIT 1`
      );
      if (statusResult.rows.length > 0 && !chunks.find(c => c.title === 'CSUCI Service Status')) {
        chunks.unshift({ ...statusResult.rows[0], similarity: 1.0 });
      }
    }

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
      Filter out low quality chunks:
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
      // Low similarity -> use web search instead
      console.log(`Low similarity (${bestScore.toFixed(2)}) - using web search for: "${lastMessage.slice(0, 50)}"`);
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
      system: `${SYSTEM_PROMPT}\n\nCSUCI CONTEXT (from ${source}) - USE THIS CONTENT TO ANSWER, DO NOT IGNORE IT:\n${context}`,
      messages,
    });

    res.json({ reply: response.content[0].text });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'EkhoBot hit a wave - try again!' });
  }
});

/*
================================================================================
RATING SYSTEM
================================================================================
Saves user ratings with chat history for review
*/

/*
ENDPOINT: POST /rate
PURPOSE: Save ratings with chat to prove EkhoBot
BODY: { userMessage, botResponse, rating, conversation }
RETURNS: { success: true }
*/
app.post('/rate', async (req, res) => {
  const { userMessage, botResponse, rating, conversation } = req.body;

  // validate rating value
  if (!['up', 'down'].includes(rating)) {
    return res.status(400).json({ error: 'Invalid rating' });
  }

  try {
    await db.query(
      `INSERT INTO ekhobot_ratings (user_message, bot_response, rating, conversation)
       VALUES ($1, $2, $3, $4)`,
      [userMessage, botResponse, rating, JSON.stringify(conversation)]
    );

    console.log(`Rating saved: ${rating} - "${userMessage.slice(0, 60)}"`);
    res.json({ success: true });

  } catch (err) {
    console.error('Rating save failed:', err.message);
    res.status(500).json({ error: 'Failed to save rating' });
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
