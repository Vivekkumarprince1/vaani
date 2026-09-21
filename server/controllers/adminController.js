const User = require('../lib/models/User');
const GroupCall = require('../lib/models/GroupCall');
const Chat = require('../lib/models/Chat');
const providerManager = require('../server/providers/providerManager');
const livekitManager = require('../server/sfu/LiveKitManager');

/**
 * GET /api/admin/metrics
 * System-wide metrics and counters
 */
exports.getMetrics = async (req, res) => {
  try {
    const [
      totalUsers,
      onlineUsers,
      adminUsers,
      activeCalls,
      totalMessages
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'online' }),
      User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
      GroupCall.countDocuments({ status: 'active' }),
      Chat.countDocuments()
    ]);

    const activeProviders = {
      pipeline: providerManager.getActiveProvider('pipeline').providerName || 'versionB_pipeline',
      realtime: providerManager.getActiveProvider('realtime').providerName || 'openai',
      stt: providerManager.getActiveProvider('stt').providerName,
      tts: providerManager.getActiveProvider('tts').providerName,
      translation: providerManager.getActiveProvider('translation').providerName,
      sfu: providerManager.getActiveProvider('sfu').providerName,
    };

    return res.json({
      metrics: {
        totalUsers,
        onlineUsers,
        adminUsers,
        activeCalls,
        totalMessages
      },
      activeProviders,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('[getMetrics] Error:', err);
    return res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
};

/**
 * GET /api/admin/users
 * Search and list users with pagination
 */
exports.getUsers = async (req, res) => {
  try {
    const { search = '', role, status, page = 1, limit = 20 } = req.query;
    const query = {};

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { username: searchRegex },
        { mobileNumber: searchRegex },
        { email: searchRegex }
      ];
    }

    if (role) {
      query.role = role;
    }

    if (status) {
      query.status = status;
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('username mobileNumber email role status isActive preferredLanguage createdAt lastActive')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      User.countDocuments(query)
    ]);

    return res.json({
      users,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('[getUsers] Error:', err);
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
};

/**
 * PATCH /api/admin/users/:id/role
 * Change a user's role
 */
exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const callerRole = req.user.role || 'user';
    const callerId = req.user.userId;

    const validRoles = ['user', 'admin', 'superadmin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Role modification permissions:
    // Admin cannot change role of another admin or superadmin, and cannot promote to superadmin
    if (callerRole === 'admin') {
      if (targetUser.role === 'admin' || targetUser.role === 'superadmin') {
        return res.status(403).json({ error: 'Admins cannot modify roles of other admins or superadmins' });
      }
      if (role === 'superadmin') {
        return res.status(403).json({ error: 'Only superadmins can appoint superadmins' });
      }
    }

    // Protect against demoting the last superadmin
    if (targetUser.role === 'superadmin' && role !== 'superadmin') {
      const superadminCount = await User.countDocuments({ role: 'superadmin' });
      if (superadminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the only superadmin in the system' });
      }
    }

    targetUser.role = role;
    await targetUser.save();

    return res.json({
      success: true,
      user: {
        id: targetUser._id,
        username: targetUser.username,
        role: targetUser.role
      }
    });
  } catch (err) {
    console.error('[updateUserRole] Error:', err);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
};

/**
 * PATCH /api/admin/users/:id/status
 * Toggle user active status (suspend/activate)
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be a boolean' });
    }

    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({ error: 'You cannot change active status on your own account' });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    targetUser.isActive = isActive;
    await targetUser.save();

    return res.json({
      success: true,
      user: {
        id: targetUser._id,
        username: targetUser.username,
        isActive: targetUser.isActive
      }
    });
  } catch (err) {
    console.error('[updateUserStatus] Error:', err);
    return res.status(500).json({ error: 'Failed to update user status' });
  }
};

/**
 * GET /api/admin/providers
 * Fetch masked provider configs for UI
 */
exports.getProviders = async (req, res) => {
  try {
    const configs = providerManager.getMaskedConfigs();
    return res.json(configs);
  } catch (err) {
    console.error('[getProviders] Error:', err);
    return res.status(500).json({ error: 'Failed to retrieve provider configs' });
  }
};

/**
 * PUT /api/admin/providers/:category
 * Save provider category settings (Superadmin only)
 */
exports.updateProviderCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const updates = req.body;

    const validCategories = ['pipeline', 'realtime', 'stt', 'tts', 'translation', 'sfu'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid provider category' });
    }

    const updatedConfig = await providerManager.updateCategoryConfig(
      category,
      updates,
      req.user.userId
    );

    return res.json({
      success: true,
      category,
      config: updatedConfig
    });
  } catch (err) {
    console.error('[updateProviderCategory] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update provider config' });
  }
};

/**
 * POST /api/admin/providers/test
 * Test credentials / connection for a provider
 */
exports.testProvider = async (req, res) => {
  try {
    const { category, providerName, credentials } = req.body;

    if (!category || !providerName) {
      return res.status(400).json({ error: 'category and providerName are required' });
    }

    const result = await providerManager.testConnection(
      category,
      providerName,
      credentials || {}
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('[testProvider] Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Connection test failed' });
  }
};

/**
 * GET /api/admin/rooms
 * List active calls from DB and LiveKit server
 */
exports.getLiveRooms = async (req, res) => {
  try {
    const [dbCalls, lkRooms] = await Promise.all([
      GroupCall.find({ status: { $in: ['active', 'ringing'] } })
        .populate('initiator', 'username mobileNumber')
        .populate('participants.userId', 'username mobileNumber')
        .sort({ startedAt: -1 }),
      livekitManager.listRooms()
    ]);

    const livekitMap = new Map();
    for (const r of lkRooms) {
      livekitMap.set(r.name, r);
    }

    const rooms = dbCalls.map(call => {
      const lkRoom = livekitMap.get(call.callRoomId);
      return {
        id: call._id,
        callRoomId: call.callRoomId,
        callType: call.callType,
        status: call.status,
        startedAt: call.startedAt,
        initiator: call.initiator,
        participants: call.participants.map(p => ({
          user: p.userId,
          status: p.status,
          joinedAt: p.joinedAt
        })),
        livekitActive: Boolean(lkRoom),
        numParticipants: lkRoom ? lkRoom.numParticipants : call.activeParticipants.length
      };
    });

    return res.json({ rooms });
  } catch (err) {
    console.error('[getLiveRooms] Error:', err);
    return res.status(500).json({ error: 'Failed to retrieve live rooms' });
  }
};

/**
 * DELETE /api/admin/rooms/:callRoomId
 * Force terminate an ongoing call room
 */
exports.terminateRoom = async (req, res) => {
  try {
    const { callRoomId } = req.params;

    // Delete from LiveKit SFU
    await livekitManager.deleteRoom(callRoomId);

    // Update MongoDB record
    const call = await GroupCall.findOne({ callRoomId });
    if (call) {
      call.endCall();
      await call.save();
    }

    return res.json({
      success: true,
      message: `Room ${callRoomId} terminated successfully`
    });
  } catch (err) {
    console.error('[terminateRoom] Error:', err);
    return res.status(500).json({ error: 'Failed to terminate room' });
  }
};

/**
 * POST /api/admin/realtime/session
 * Generate an ephemeral OpenAI Realtime session token (Version A)
 */
exports.createRealtimeSession = async (req, res) => {
  try {
    const { createRealtimeSession } = require('../server/providers/realtimeService');
    const result = await createRealtimeSession(req.body);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
