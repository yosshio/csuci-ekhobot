# EkhoBot Command Reference

All commands assume you are in the EkhoBot project folder unless specified.

---

## Starting the Backend

```bash
cd backend
node server.js
```

Keep this terminal open. The server must stay running for the chat to work.

Expected output:
```
Database connected successfully
Loading embedding model...
Embedding model ready.
EkhoBot backend running at http://localhost:3000
Ready to answer questions about CSUCI!
Events refresh complete. 27/27 pages saved.
```

---

## Opening the Frontend

**Option 1 - npx serve (recommended, avoids file:// CORS issues):**
```bash
cd frontend
npx serve .
```
Then open the URL it gives you (usually http://localhost:3000 or http://localhost:5000).

**Option 2 - double click:**
Navigate to the `frontend` folder and double-click `index.html`.

**Option 3 - command line:**
```bash
cd frontend
start index.html       # Windows
open index.html        # macOS
```

---

## Crawling the Website (Builds Database)

```bash
cd backend
node scripts/index.js
```

Takes 30-60 minutes depending on MAX_PAGES setting.
Deletes all existing chunks and starts fresh.
Progress shows as: `[423] 4 chunks — Financial Aid Office - CSUCI`

---

## Refreshing Events Manually

```bash
cd backend
node scripts/fetchEvents.js
```

Normally runs automatically every night at midnight.
Run this manually if you want fresh event data immediately.

---

## Setting Alerts

**Set an alert:**
```bash
cd backend
node setAlert.js "Campus power outage"
```

**Clear an alert:**
```bash
cd backend
node setAlert.js clear
```

**Windows batch shortcut:**
```bash
cd backend
alert.bat "Weather alert: Campus closed"
alert.bat clear
```

---

## Installing Dependencies

Run this once after cloning or when package.json changes:
```bash
cd backend
npm install
```

---

## Checking if Backend is Running

```bash
curl http://localhost:3000/health
```

Should return:
```json
{"status":"ready"}
```

If you get a connection error, the backend is not running.

---

## Database Checks (Run in Supabase SQL Editor)

**Count total chunks and pages:**
```sql
SELECT COUNT(*) as total_chunks,
       COUNT(DISTINCT url) as unique_pages
FROM csuci_chunks;
```

**Check database size:**
```sql
SELECT pg_size_pretty(pg_total_relation_size('csuci_chunks')) as size;
```

**See pages with most chunks:**
```sql
SELECT url, COUNT(*) as chunks
FROM csuci_chunks
GROUP BY url
ORDER BY chunks DESC
LIMIT 10;
```

**Delete all data (before re-crawl):**
```sql
DELETE FROM csuci_chunks;
```

---

## Setting Alert via API (curl)

**Set alert:**
```bash
curl -X POST http://localhost:3000/alert \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"Campus closed\",\"key\":\"ekhobot2026\"}"
```

**Get current alert:**
```bash
curl http://localhost:3000/alert
```

**Clear alert:**
```bash
curl -X POST http://localhost:3000/alert \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"\",\"key\":\"ekhobot2026\"}"
```

---

## Changing Crawl Depth

Edit `backend/scripts/index.js` line ~106:
```javascript
const MAX_PAGES = 1500;  // change this number (crawling csuci xml only yielded 600 or so)
```

Then re-run the crawler:
```bash
node scripts/index.js
```

---

## Full Startup Sequence (Every Time)

```bash
# Terminal 1 - Backend
cd backend
node server.js

# Terminal 2 - Frontend
cd frontend
npx serve .
```

Open the URL from npx serve in your browser.

---

## First Time Setup Sequence

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Create .env file with your keys (do this manually)
# ANTHROPIC_API_KEY=your_key
# DATABASE_URL=your_supabase_url
# ALERT_KEY=ekhobot2026

# 3. Build database (takes 30-60 min)
node scripts/index.js

# 4. Start server
node server.js

# 5. Open frontend (new terminal)
cd frontend
npx serve .
```

---

## Quick Reference

| What | Command |
|------|---------|
| Start backend | `cd backend && node server.js` |
| Open frontend | `cd frontend && npx serve .` |
| Crawl website | `cd backend && node scripts/index.js` |
| Refresh events | `cd backend && node scripts/fetchEvents.js` |
| Set alert | `cd backend && node setAlert.js "message"` |
| Clear alert | `cd backend && node setAlert.js clear` |
| Check health | `curl http://localhost:3000/health` |
| Install deps | `cd backend && npm install` |