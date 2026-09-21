const jwt = require('jsonwebtoken');
const User = require('../lib/models/User');

const authenticate = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ error: 'No token, authorization denied' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey');
    req.user = decoded;
    
    // Optional: Refresh role and isActive status from DB if userId is present
    if (decoded.userId) {
      const user = await User.findById(decoded.userId).select('role isActive');
      if (user) {
        if (user.isActive === false) {
          return res.status(403).json({ error: 'Account is deactivated' });
        }
        req.user.role = user.role || 'user';
      }
    }
    
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

/**
 * Role-based authorization middleware
 * @param  {...string} roles Allowed roles (e.g. 'admin', 'superadmin')
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userRole = req.user.role || 'user';
    
    // Superadmin has access to any role-protected resource
    if (userRole === 'superadmin' || roles.includes(userRole)) {
      return next();
    }
    
    return res.status(403).json({
      error: `Forbidden: Requires one of [${roles.join(', ')}] permissions`
    });
  };
};

authenticate.authenticate = authenticate;
authenticate.requireRole = requireRole;

module.exports = authenticate;
