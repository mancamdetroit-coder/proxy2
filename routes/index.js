const express = require('express');
const path = require('path');
const router = express.Router();
const { requirePageAccess, requireAdmin } = require('../middleware/auth');
const proxyRoutes = require('./proxy');
const authRoutes = require('./auth');
const adminRoutes = require('./admin');

// Auth (login/logout)
router.use('/', authRoutes);

// Admin — must be admin
router.use('/admin', requireAdmin, adminRoutes);

// Proxy — must have page access
router.use('/proxy', requirePageAccess('/proxy'), proxyRoutes);

// Homepage — public
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Clarinet to Keyboard — protected by page access
router.use('/clarinet-to-keyboard', requirePageAccess('/clarinet-to-keyboard'), (req, res) => {
  res.sendFile(path.join(__dirname, '../public/clarinet-to-keyboard/index.html'));
});

// Catch-all
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

module.exports = router;
