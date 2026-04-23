import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { pipeline } from '@xenova/transformers';
import pg from 'pg';

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

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

// --- Local embedding model (no API key needed) ---
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

// Load embedder on startup
loadEmbedder();

// --- Search the vector database for relevant chunks ---
const SIMILARITY_THRESHOLD = 0.4;
const TOP_K = 5;

async function searchChunks(query) {
  const embedding = await getEmbedding(query);
  const result = await db.query(
    `SELECT content, url, title,
     1 - (embedding <=> $1::vector) as similarity
     FROM csuci_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(embedding), TOP_K]
  );
  return result.rows;
}

// --- Brave Search fallback for when no good DB match is found ---
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
Answer using only the context provided below. If the context does not cover the question say so briefly and direct them to csuci.edu.

STRICT RULES — no exceptions:
- Maximum 1-2 sentences per response. Never more.
- No bullet points, no lists, no numbered steps.
- No introductory phrases like "Great question!" or "Sure!".
- Answer directly and stop.
- If unsure: "Visit csuci.edu or call (805) 437-8400."
- Never invent phone numbers, emails, or dates not found in the context.

For upcoming campus events, direct users to:
- Website: csuci.edu/events/index.htm
- Email: events@csuci.edu  
- Phone: 805-437-3900`;

app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  const lastMessage = messages[messages.length - 1].content;

  try {
    // Search vector database
    const chunks = await searchChunks(lastMessage);
    const bestScore = chunks[0]?.similarity || 0;

    let context = '';
    let source = 'database';

    if (bestScore >= SIMILARITY_THRESHOLD) {
      // Good match found in database
      context = chunks
        .map(c => `[Source: ${c.url}]\n${c.content}`)
        .join('\n\n');
      console.log(`DB match (${bestScore.toFixed(2)}): "${lastMessage.slice(0, 50)}"`);
    } else {
      // No good match — fall back to live web search
      console.log(`Low similarity (${bestScore.toFixed(2)}) — using web search for: "${lastMessage.slice(0, 50)}"`);
      context = await webSearchFallback(lastMessage);
      source = 'web search';
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `${SYSTEM_PROMPT}\n\nCSUCI CONTEXT (from ${source}):\n${context}`,
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