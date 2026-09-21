const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// All admin routes require authentication and at least admin role
router.use(authenticate);

// Metrics & Analytics (admin & superadmin)
router.get('/metrics', requireRole('admin', 'superadmin'), adminController.getMetrics);

// User Management (admin & superadmin)
router.get('/users', requireRole('admin', 'superadmin'), adminController.getUsers);
router.patch('/users/:id/role', requireRole('admin', 'superadmin'), adminController.updateUserRole);
router.patch('/users/:id/status', requireRole('admin', 'superadmin'), adminController.updateUserStatus);

// Live Rooms (admin & superadmin)
router.get('/rooms', requireRole('admin', 'superadmin'), adminController.getLiveRooms);
router.delete('/rooms/:callRoomId', requireRole('admin', 'superadmin'), adminController.terminateRoom);

// Provider & API Key Management
// Viewing masked configs is available to admin & superadmin
router.get('/providers', requireRole('admin', 'superadmin'), adminController.getProviders);

// Modifying configs & testing keys is strictly reserved for superadmin
router.put('/providers/:category', requireRole('superadmin'), adminController.updateProviderCategory);
router.post('/providers/test', requireRole('superadmin'), adminController.testProvider);
router.post('/realtime/session', requireRole('admin', 'superadmin'), adminController.createRealtimeSession);

module.exports = router;
