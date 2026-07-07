/**
 * server.js — Anthropic API proxy for the Phishing Detection Study
 *
 * WHY THIS EXISTS:
 * Browsers enforce the Same-Origin Policy: a page at file:// or localhost
 * cannot fetch from api.anthropic.com directly because Anthropic's API does
 * not return the Access-Control-Allow-Origin header that would permit it.
 * This server runs locally, accepts requests from the browser, forwards them
 * to Anthropic, and returns the response. The browser talks to localhost
 * (same origin); this server talks to Anthropic (server-to-server, no CORS).
 *
 * USAGE:
 *   1. Add your Anthropic API key to a .env file: ANTHROPIC_API_KEY=sk-ant-...
 *   2. npm install
 *   3. node server.js
 *   4. Open index.html in your browser (or serve it via this server)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ---- Middleware ----

app.use(express.json({ limit: '1mb' })); // emails can be verbose

// Allow requests from the browser regardless of origin — this is a local
// research tool, not a public server. In production you would lock this to
// a specific domain.
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Serve the frontend statically so you can open localhost:3001 directly
// rather than opening index.html as a file:// URL.
app.use(express.static(path.join(__dirname)));

// ---- Health check ----
// The frontend pings this on load to show the proxy status indicator.

app.get('/health', (req, res) => {
  const keyPresent = Boolean(ANTHROPIC_API_KEY);
  res.json({
    status: 'ok',
    proxy: 'running',
    api_key_configured: keyPresent,
    timestamp: new Date().toISOString(),
  });
});

// ---- Main proxy endpoint ----

app.post('/analyze', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not set. Add it to a .env file and restart the server.',
    });
  }

  const { messages, model, max_tokens, system } = req.body;

  // Basic validation — don't forward malformed requests to Anthropic
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Request must include a non-empty messages array.' });
  }

  try {
    const anthropicPayload = {
      model: model || 'claude-sonnet-4-6',
      max_tokens: max_tokens || 1000,
      messages,
    };
    if (system) anthropicPayload.system = system;

    const upstream = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicPayload),
    });

    const data = await upstream.json();

    // Forward Anthropic's status code so the client can distinguish
    // rate limits (429), auth errors (401), etc.
    res.status(upstream.status).json(data);

  } catch (err) {
    console.error('[proxy] Upstream fetch failed:', err.message);
    res.status(502).json({
      error: 'Proxy could not reach api.anthropic.com.',
      detail: err.message,
    });
  }
});

// ---- Start ----

app.listen(PORT, () => {
  console.log(`\n  Phishing Study Proxy running at http://localhost:${PORT}`);
  console.log(`  API key configured: ${Boolean(ANTHROPIC_API_KEY)}`);
  console.log(`  Open http://localhost:${PORT} in your browser\n`);
});
