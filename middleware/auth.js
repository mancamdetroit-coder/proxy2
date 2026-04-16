const { getUserById } = require('../db');

// Attach full user object to req.user on every request
function loadUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = getUserById(req.session.userId);
    if (user) {
      req.user = user;
    } else {
      req.session.destroy();
    }
  }
  next();
}

// Must be logged in
function requireLogin(req, res, next) {
  if (!req.user) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

// Must be admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).sendFile(require('path').join(__dirname, '../public/403.html'));
  }
  next();
}

// Must have access to the specific page path
function requirePageAccess(pagePath) {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    if (req.user.role === 'admin') return next(); // admin always has access
    const hasAccess = req.user.pages && req.user.pages.some(p => req.originalUrl.startsWith(p.path));
    if (!hasAccess) {
      return res.status(403).sendFile(require('path').join(__dirname, '../public/403.html'));
    }
    next();
  };
}

// Can the actor remove the target user?
function canRemove(actor, target) {
  if (!actor.can_remove_users) return false;
  if (target.role === 'admin') return false; // nobody removes admin
  if (actor.role === 'admin') return true;   // admin removes anyone
  if (actor.remove_scope === 'own') {
    return target.created_by === actor.id;
  }
  if (actor.remove_scope === 'all') {
    // Can remove anyone except admin and users the admin directly added
    return target.created_by !== null && target.role !== 'admin';
  }
  return false;
}

module.exports = { loadUser, requireLogin, requireAdmin, requirePageAccess, canRemove };
