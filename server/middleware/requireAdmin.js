// Step settings-guard (ADR-042): a change needs a logged-in admin.
// Relies on req.user from auth.js currentUser (null when logged out).
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Log in first' });
  if (req.user.can_admin !== 1) return res.status(403).json({ error: 'Only an admin can change settings' });
  next();
}

module.exports = requireAdmin;
