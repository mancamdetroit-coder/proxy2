const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// Serve the proxy UI at /proxy (index.html is already handled by static middleware)

// Dynamic route: /proxy/:url
router.get('/:encodedUrl', async (req, res) => {
  let input = decodeURIComponent(req.params.encodedUrl).trim();

  // Normalize: add https:// if missing
  if (!/^https?:\/\//i.test(input)) {
    input = 'https://' + input;
  }

  try {
    const response = await fetch(input, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const contentType = response.headers.get('content-type') || 'text/html';
    const body = await response.text();
    res.setHeader('Content-Type', contentType);
    res.send(body);
  } catch (err) {
    res.status(500).send(`<h2>Failed to load: ${input}</h2><p>${err.message}</p>`);
  }
});

module.exports = router;
