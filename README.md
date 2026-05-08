# EkhoBot - CSUCI Virtual Assistant

AI-powered chatbot for CSU Channel Islands. Answers student questions about admissions, financial aid, housing, parking, events, and campus services using semantic search and natural language processing.

---

## How It Works

EkhoBot is a RAG (Retrieval-Augmented Generation) chatbot. It searches an indexed copy of the CSUCI website to find relevant content, then uses Claude AI to generate a conversational answer.

1. Student asks a question in the chat widget
2. Backend converts the question to a vector (384 numbers representing meaning)
3. Database finds the most similar content using vector math
4. Backend sends that content + the question to Claude AI
5. Claude generates a natural answer with links and contact info
6. Response appears in chat

The embedding model (Xenova/all-MiniLM-L6-v2) runs locally and converts text to vectors. Similar meanings produce similar vectors, so "how do I pay for school" matches "financial aid" content even without exact word matches.

---

## Project Structure

```
EkhoBot CS Capstone S2026/
├── README.md
├── COMMANDS.md
├── backend/
│   ├── server.js              # Express API - handles chat, alerts, ratings
│   ├── scripts/
│   │   ├── index.js          # Website crawler - builds database
│   │   └── fetchEvents.js    # Event scraper - runs nightly at midnight
│   ├── setAlert.js           # CLI tool for setting alerts
│   ├── alert.bat             # Windows batch wrapper for alerts
│   ├── package.json
│   └── .env                  # API keys (not in git)
│
└── frontend/
    ├── CSU Channel Islands.html   # Main page - chat widget is injected here
    ├── ekhobot.js                 # Chat widget - entire UI in one file
    └── images/
        ├── ci-dolphin-logo.png
        └── dolphin-logo-b64.js    # Base64 encoded logo for inline use
```

---

## Running the Project

**Terminal 1 - Start backend:**
```bash
cd backend
node server.js
```

**Terminal 2 - Start frontend:**
```bash
cd frontend
npx serve . -l 3001
```

**Open in browser:**
```
http://localhost:3001/CSU%20Channel%20Islands.html
```

See COMMANDS.md for the full command reference including alerts, crawling, and database checks.

---

## Database Tables

**csuci_chunks**

The main search database. Built by running the crawler (index.js) and stores all indexed content from the CSUCI website. The crawler pulled ~600 pages from csuci.edu, split each page into 800-character chunks, generated a vector embedding for each chunk, and saved everything here.

| Column | Description |
|--------|-------------|
| id | Auto-generated unique number for each row |
| url | The webpage the chunk came from (e.g. csuci.edu/financialaid/) |
| title | The page title at the time of crawling |
| content | 800-character slice of text from that page |
| embedding | 384-dimensional vector representing the meaning of the content, used for semantic search |

**ekhobot_ratings**

Stores user feedback submitted via the thumbs up/down rating buttons in the chat. Ratings only appear after the user has sent at least 3 messages. Used for reviewing performance and improving responses over time.

| Column | Description |
|--------|-------------|
| id | Auto-generated unique number for each row |
| created_at | Timestamp of when the rating was submitted |
| user_message | The question the student asked |
| bot_response | The answer EkhoBot gave |
| rating | Either "up" (helpful) or "down" (not helpful) |
| conversation | Full chat history as JSON at the time of rating |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /chat | POST | Send message, get AI response |
| /alert | GET | Get current campus alert |
| /alert | POST | Set or clear alert (requires key) |
| /rate | POST | Submit a rating |
| /health | GET | Check if server is running |

---

## Environment Variables (.env)

```
ANTHROPIC_API_KEY=your_key_here
DATABASE_URL=your_supabase_connection_string
ALERT_KEY=ekhobot2026
```

---

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** PostgreSQL with pgvector (hosted on Supabase)
- **AI:** Claude Sonnet 4 (Anthropic), Xenova/all-MiniLM-L6-v2 (embeddings)
- **Crawling:** Cheerio, pdf-parse-new
- **Frontend:** Vanilla JavaScript

---

**CS Capstone Project, Spring 2026**
**CSU Channel Islands**
**Antonio Flores | Antonio.Flores986@myci.csuci.edu**