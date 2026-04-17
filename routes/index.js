const express = require('express');
const path = require('path');
const router = express.Router();

const { requirePageAccess } = require('../middleware/auth');
const proxyRoutes = require('./proxy');
const authRoutes = require('./auth');
const adminRoutes = require('./admin');

// Auth routes (login/logout)
router.use('/proxy', proxyRouter);

// Admin routes
router.use('/admin', adminRoutes);

// Proxy — protected by page access
router.use('/proxy', requirePageAccess('/proxy'), proxyRoutes);

// Homepage — public
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Catch-all
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

module.exports = router;
