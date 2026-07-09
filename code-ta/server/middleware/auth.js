const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    console.warn('[AUTH] Missing or invalid Authorization header');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (e) {
    console.warn('[AUTH] Invalid token:', e.message);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}; 