const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcrypt');
const { getUserByUsername } = require('../db');

// Show login page
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Handle login form submit
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.sendFile(path.join(__dirname, '../public/login.html'));
  }
  req.session.userId = user.id;
  const next = req.query.next || '/';
  res.redirect(next);
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
