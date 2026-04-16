const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.use(async (req, res) => {
  try {
    let target = req.query.url || req.path.slice(1);

    if (!target) {
      return res.redirect('/proxy/');
    }

    // Problem 4: If it's not a valid URL → auto search on Google
    if (!target.startsWith('http') && !target.includes('.')) {
      target = 'https://www.google.com/search?q=' + encodeURIComponent(target);
    } else if (!target.startsWith('http')) {
      target = 'https://' + target;
    }

    console.log('Proxying →', target);

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    res.set('Content-Type', contentType);

    let body = await response.text();

    // Much better rewriting for images, CSS, JS, videos, etc.
    const base = '/proxy/';
    body = body.replace(/(href|src|action|data-src|data-original|poster|srcset)=["']([^"']+)["']/gi, (match, attr, url) => {
      if (url.startsWith('data:') || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('blob:')) {
        return match;
      }

      if (url.startsWith('http') || url.startsWith('//')) {
        const clean = url.replace(/^https?:\/\//, '');
        return `${attr}="${base}${clean}"`;
      }

      // Handle relative URLs (very important for images and sub-resources)
      if (url.startsWith('/')) {
        const origin = new URL(target).origin;
        const clean = origin.replace(/^https?:\/\//, '') + url;
        return `${attr}="${base}${clean}"`;
      }

      return match;
    });

    // Also rewrite srcset (common for responsive images)
    body = body.replace(/srcset=["']([^"']+)["']/gi, (match, srcset) => {
      const newSrcset = srcset.split(',').map(item => {
        const parts = item.trim().split(' ');
        if (parts[0].startsWith('http') || parts[0].startsWith('//')) {
          const clean = parts[0].replace(/^https?:\/\//, '');
          parts[0] = base + clean;
        } else if (parts[0].startsWith('/')) {
          const origin = new URL(target).origin.replace(/^https?:\/\//, '');
          parts[0] = base + origin + parts[0];
        }
        return parts.join(' ');
      }).join(', ');
      return `srcset="${newSrcset}"`;
    });

    res.send(body);

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).send(`
      <h1>Proxy Error</h1>
      <p>Could not load the page: ${err.message}</p>
      <a href="/proxy/">← Back to Proxy</a>
    `);
  }
});

module.exports = router;
