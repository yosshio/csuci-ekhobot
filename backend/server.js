import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:3001']
}));
app.use(express.json());

const SYSTEM_PROMPT = `You are EkhoBot, the friendly virtual assistant for 
CSU Channel Islands (CSUCI) — named after the school's dolphin mascot, Ekho.
You help students, parents, and visitors with:
- Admissions and enrollment
- Financial aid and scholarships
- Campus events and announcements
- Staff and department contacts
- General campus FAQs

Be warm, helpful, and concise. Keep replies under 3 sentences unless 
step-by-step guidance is needed. If unsure, direct to www.csuci.edu 
or call (805) 437-8400. Never make up specific dates or staff names.`;

app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages,
    });
    res.json({ reply: response.content[0].text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'EkhoBot hit a wave — try again!' });
  }
});

app.listen(3000, () => console.log('EkhoBot backend running at http://localhost:3000'));