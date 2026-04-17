const express = require('express');
const { updatePassword, setPasswordHint, getPasswordHint } = require('../db');
const path = require('path');
const { requireAdmin, requireLogin, canRemove } = require('../middleware/auth');
const {
  getAllUsers, getAllPages, getUserPages,
  createUser, updateUser, deleteUser,
  addPage, getUserById
} = require('../db');

const router = express.Router();

// ─── Admin Panel UI ───────────────────────────────────────────────
router.get('/', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// ─── API: Get all users ───────────────────────────────────────────
router.get('/api/users', requireLogin, (req, res) => {
  const allUsers = getAllUsers();
  const allPages = getAllPages();

  // Attach page access to each user
  const users = allUsers.map(u => ({
    ...u,
    pages: getUserPages(u.id),
    password_hint: u.password_hint || null  // already included via ...u but explicit is fine
  })); 
    
  res.json({ users, pages: allPages, currentUser: {
    id: req.user.id,
    role: req.user.role,
    can_add_users: req.user.can_add_users,
    can_add_users_who_add: req.user.can_add_users_who_add,
    can_remove_users: req.user.can_remove_users,
    remove_scope: req.user.remove_scope,
    pages: req.user.pages
  }});
});

// ─── API: Create user ─────────────────────────────────────────────
router.post('/api/users', requireLogin, (req, res) => {
  const actor = req.user;

  if (!actor.can_add_users && actor.role !== 'admin') {
    return res.status(403).json({ error: 'No permission to add users' });
  }

  const { username, password, canAddUsers, canAddUsersWhoAdd, canRemoveUsers, removeScope, pageIds } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Can only grant canAddUsers if actor has canAddUsersWhoAdd or is admin
  if (canAddUsers && !actor.can_add_users_who_add && actor.role !== 'admin') {
    return res.status(403).json({ error: 'You cannot grant add-user permission' });
  }

  // Can only grant pages actor themselves has access to (admin bypasses)
  const actorPageIds = actor.role === 'admin'
    ? getAllPages().map(p => p.id)
    : (actor.pages || []).map(p => p.id);

  const safePageIds = (pageIds || []).filter(pid => actorPageIds.includes(parseInt(pid)));

  try {
    const newId = createUser({
      username: username.trim(),
      password,
      createdBy: actor.id,
      canAddUsers: actor.role === 'admin' ? canAddUsers : (actor.can_add_users_who_add ? canAddUsers : false),
      canAddUsersWhoAdd: actor.role === 'admin' ? canAddUsersWhoAdd : false,
      canRemoveUsers,
      removeScope: removeScope || 'own',
      pageIds: safePageIds.map(Number)
    });
    res.json({ success: true, id: newId });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── API: Update user permissions ─────────────────────────────────
router.put('/api/users/:id', requireLogin, (req, res) => {
  const actor = req.user;
  const targetId = parseInt(req.params.id);
  const target = getUserById(targetId);

  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Cannot edit admin' });

  // Only admin or the user's creator can edit them
  if (actor.role !== 'admin' && target.created_by !== actor.id) {
    return res.status(403).json({ error: 'No permission to edit this user' });
  }

  const { canAddUsers, canAddUsersWhoAdd, canRemoveUsers, removeScope, pageIds } = req.body;

  const actorPageIds = actor.role === 'admin'
    ? getAllPages().map(p => p.id)
    : (actor.pages || []).map(p => p.id);

  const safePageIds = (pageIds || []).filter(pid => actorPageIds.includes(parseInt(pid)));

  updateUser(targetId, {
    canAddUsers: actor.role === 'admin' ? canAddUsers : (actor.can_add_users_who_add ? canAddUsers : false),
    canAddUsersWhoAdd: actor.role === 'admin' ? canAddUsersWhoAdd : false,
    canRemoveUsers,
    removeScope: removeScope || 'own',
    pageIds: safePageIds.map(Number)
  });

  res.json({ success: true });
});

// ─── API: Delete user ─────────────────────────────────────────────
router.delete('/api/users/:id', requireLogin, (req, res) => {
  const actor = req.user;
  const targetId = parseInt(req.params.id);
  const target = getUserById(targetId);

  if (!target) return res.status(404).json({ error: 'User not found' });

  if (!canRemove(actor, target)) {
    return res.status(403).json({ error: 'No permission to remove this user' });
  }

  deleteUser(targetId);
  res.json({ success: true });
});

// ─── API: Add a new page to the system ───────────────────────────
router.post('/api/pages', requireAdmin, (req, res) => {
  const { name, path: pagePath, description } = req.body;
  if (!name || !pagePath) return res.status(400).json({ error: 'Name and path required' });
  if (!pagePath.startsWith('/')) return res.status(400).json({ error: 'Path must start with /' });

  try {
    addPage({ name, path: pagePath, description: description || '' });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Page path already exists' });
  }
});

// ─── API: Change any user's password (admin only) ─────────────────
router.put('/api/users/:id/password', requireAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  updatePassword(targetId, password);
  res.json({ success: true });
});

// ─── API: Set password hint for any user (admin only) ────────────
router.put('/api/users/:id/hint', requireAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  const { hint } = req.body;
  const target = getUserById(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  setPasswordHint(targetId, hint || null);
  res.json({ success: true });
});

// ─── API: Get password hint (admin only) ─────────────────────────
router.get('/api/users/:id/hint', requireAdmin, (req, res) => {
  const targetId = parseInt(req.params.id);
  const row = getPasswordHint(targetId);
  if (!row) return res.status(404).json({ error: 'User not found' });
  res.json({ hint: row.password_hint || null });
});

module.exports = router;
