const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.use(async (req, res) => {
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
    res.status(500).send(`<h1>Proxy Error</h1><p>${err.message}</p><a href="/proxy/">← Back</a>`);
  }
});

module.exports = router;
