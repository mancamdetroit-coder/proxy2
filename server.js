const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve a nice landing page at /
app.use(express.static('public'));

// Proxy route: /proxy/https://example.com or /proxy?url=https://example.com
app.use('/proxy', async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1); // remove leading /
    if (!target.startsWith('http')) target = 'https://' + target;

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const contentType = response.headers.get('content-type');
    res.set('Content-Type', contentType || 'text/html');

    let body = await response.text();

    // Basic rewriting so links stay inside the proxy
    const base = '/proxy/';
    body = body.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, url) => {
      if (url.startsWith('http') || url.startsWith('//')) {
        return `${attr}="${base}${url.replace(/^https?:\/\//, '')}"`;
      }
      return match;
    });

    res.send(body);
  } catch (err) {
    res.status(500).send(`<h1>Proxy Error</h1><p>${err.message}</p><p>Try a different site or check the URL.</p>`);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running on port ${PORT}`);
});
