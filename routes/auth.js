const express = require('express');
const router = express.Router();
const path = require('path');
const { getUserByUsername } = require('../db');
const bcrypt = require('bcrypt');

// Show login page
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Handle login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).sendFile(path.join(__dirname, '../public/login.html'));
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
