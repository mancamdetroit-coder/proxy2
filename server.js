const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (homepage) from public folder
app.use(express.static('public'));

// ======================
// PROXY ROUTE - everything under /proxy
// ======================
app.use('/proxy', async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1); // slice(1) removes leading /
    if (!target) return res.redirect('/'); // go back to homepage if no url

    if (!target.startsWith('http')) {
      target = 'https://' + target;
    }

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    res.set('Content-Type', contentType);

    let body = await response.text();

    // Basic rewriting so links stay inside /proxy
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
    console.error(err);
    res.status(500).send(`
      <h1>Proxy Error</h1>
      <p>${err.message}</p>
      <a href="/">← Back to Home</a>
    `);
  }
});

// Catch-all: if someone visits root or any unknown path → show homepage
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

app.listen(PORT, () => {
  console.log(`✅ Hamshchos Proxy running on port ${PORT}`);
  console.log(`Homepage: http://localhost:${PORT}`);
  console.log(`Proxy example: http://localhost:${PORT}/proxy/youtube.com`);
});
