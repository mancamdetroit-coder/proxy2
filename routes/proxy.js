const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.get('/:encodedUrl(*)', async (req, res) => {
  let input = decodeURIComponent(req.params.encodedUrl).trim();

  if (!/^https?:\/\//i.test(input)) {
    input = 'https://' + input;
  }

  try {
    const response = await fetch(input, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
      }
    });

    const finalUrl = response.url; // where fetch ended up after redirects
    const base = new URL(finalUrl).origin; // e.g. https://www.youtube.com
    const contentType = response.headers.get('content-type') || 'text/html';

    if (!contentType.includes('text/html')) {
      // For images, CSS, JS etc — just pipe through directly
      const buffer = await response.buffer();
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    let body = await response.text();

    // Rewrite absolute URLs so they go through your proxy
    body = body.replace(/(href|src|action)="(https?:\/\/[^"]+)"/g, (match, attr, url) => {
      return `${attr}="/proxy/${encodeURIComponent(url)}"`;
    });

    // Rewrite relative URLs using the final base URL
    body = body.replace(/(href|src|action)="(\/[^"]+)"/g, (match, attr, path) => {
      return `${attr}="/proxy/${encodeURIComponent(base + path)}"`;
    });

    res.setHeader('Content-Type', contentType);
    res.send(body);

  } catch (err) {
    res.status(500).send(`<h2>Failed to load: ${input}</h2><p>${err.message}</p>`);
  }
});

module.exports = router;
