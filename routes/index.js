const express = require('express');
const path = require('path');
const router = express.Router();

// Import routes
const proxyRoutes = require('./proxy');

// Mount routes
router.use('/proxy', proxyRoutes);

// Homepage - serve blank minimal page
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Catch-all for other pages (in case you add more later)
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

module.exports = router;
