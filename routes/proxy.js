const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// Main proxy handler
router.use(async (req, res) => {
  try {
    // Get the target URL correctly
    let target = req.query.url || req.path.slice(1);   // remove leading /

    if (!target) {
      return res.redirect('/proxy/');
    }

    // Fix: Make sure we have a proper full URL
    if (!target.startsWith('http')) {
      target = 'https://' + target;
    }

    console.log('Proxying to:', target);   // helpful for debugging

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      }
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    res.set('Content-Type', contentType);

    let body = await response.text();

    // Improved rewriting - only rewrite absolute http/https links
    const base = '/proxy/';
    body = body.replace(/(href|src|action|data-src|poster)=["']([^"']+)["']/gi, (match, attr, url) => {
      // Skip data URLs, anchors, and already-relative links
      if (url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:')) {
        return match;
      }

      if (url.startsWith('http') || url.startsWith('//')) {
        let fullUrl = url.startsWith('//') ? 'https:' + url : url;
        const clean = fullUrl.replace(/^https?:\/\//, '');
        return `${attr}="${base}${clean}"`;
      }

      // For relative URLs, keep them as-is (they will load from the original site context)
      return match;
    });

    res.send(body);

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).send(`
      <h1>Proxy Error</h1>
      <p>Could not load the page.</p>
      <p>Error: ${err.message}</p>
      <a href="/proxy/">← Try Again</a>
    `);
  }
});

module.exports = router;
