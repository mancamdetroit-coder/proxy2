const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

router.get('/:encodedUrl(*)', async (req, res) => {
  let input = decodeURIComponent(req.params.encodedUrl).trim();

  // If it's just words or an invalid URL, search Google instead
  const looksLikeUrl = /^(https?:\/\/)?[\w\-]+(\.[\w\-]+)+(\/.*)?$/.test(input);
  if (!looksLikeUrl) {
    const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(input);
    return res.redirect('/proxy/' + encodeURIComponent(searchUrl));
  }

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

    const finalUrl = response.url;
    const base = new URL(finalUrl).origin;
    const contentType = response.headers.get('content-type') || 'text/html';

    if (!contentType.includes('text/html')) {
      const buffer = await response.buffer();
      res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }

    let body = await response.text();

    // Inject base tag for all relative resources (CSS, images, fonts)
    body = body.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${finalUrl}">`
    );

    // Only rewrite <a href> links to stay inside proxy
    body = body.replace(
      /<a\s([^>]*?)href="(https?:\/\/[^"]+)"([^>]*?)>/gi,
      (match, before, url, after) => `<a ${before}href="/proxy/${encodeURIComponent(url)}"${after}>`
    );
    body = body.replace(
      /<a\s([^>]*?)href="(\/[^"]+)"([^>]*?)>/gi,
      (match, before, path, after) => `<a ${before}href="/proxy/${encodeURIComponent(base + path)}"${after}>`
    );

    res.setHeader('Content-Type', contentType);
    res.send(body);

  } catch (err) {
    // If fetch fails (bad domain etc), search Google instead
    const searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(input);
    return res.redirect('/proxy/' + encodeURIComponent(searchUrl));
  }
});

module.exports = router;
