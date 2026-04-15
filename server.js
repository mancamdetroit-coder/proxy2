const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve ALL files from public folder (this handles homepage + all new pages)
app.use(express.static('public'));

// ======================
// PROXY ROUTE (only this part handles proxying)
app.use('/proxy', async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1);
    if (!target) return res.redirect('/proxy/');

    if (!target.startsWith('http')) target = 'https://' + target;

    const response = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    res.set('Content-Type', contentType);

    let body = await response.text();

    const base = '/proxy/';
    body = body.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, url) => {
      if (url.startsWith('http') || url.startsWith('//')) {
        const clean = url.replace(/^https?:\/\//, '');
        return `${attr}="${base}${clean}"`;
      }
      return match;
    });

    res.send(body);
  } catch (err) {
    res.status(500).send(`<h1>Proxy Error</h1><p>${err.message}</p><a href="/proxy/">← Back to Proxy</a>`);
  }
});

// ======================
// For /proxy exactly → serve the proxy index.html
app.get('/proxy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'proxy', 'index.html'));
});

// Catch-all: any other page (/, /about, /games, etc.) → serve from public folder
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Hamshchos site running on port ${PORT}`);
});
