const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve the nice landing page from public folder
app.use(express.static('public'));

// Main proxy route
app.use('/proxy', async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1);
    if (!target) return res.status(400).send('No URL provided');

    if (!target.startsWith('http')) {
      target = 'https://' + target;
    }

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const contentType = response.headers.get('content-type');
    res.set('Content-Type', contentType || 'text/html');

    let body = await response.text();

    // Basic link rewriting
    const base = '/proxy/';
    body = body.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, url) => {
      if (url.startsWith('http') || url.startsWith('//')) {
        const cleanUrl = url.replace(/^https?:\/\//, '');
        return `${attr}="${base}${cleanUrl}"`;
      }
      return match;
    });

    res.send(body);
  } catch (err) {
    console.error(err);
    res.status(500).send(`
      <h1>Proxy Error</h1>
      <p>${err.message}</p>
      <p>Try a different site or check the URL.</p>
      <a href="/">← Back to Home</a>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Hamshchos Proxy running on port ${PORT}`);
});
