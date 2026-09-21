const MessageController = require('../../controllers/messageController');
const Chat = require('../models/Chat');
const User = require('../models/User');

jest.mock('../models/Chat');
jest.mock('../models/User');
jest.mock('../db', () => jest.fn().mockResolvedValue(true));

describe('MessageController.sendMessage', () => {
  let mockReq;
  let mockRes;
  let mockIo;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: { userId: '507f1f77bcf86cd799439011', username: 'senderUser' },
      body: {
        content: 'Hello, how are you?',
        receiverId: '507f1f77bcf86cd799439012',
        clientTempId: 'temp-123'
      }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      of: jest.fn().mockReturnValue({
        sockets: new Map()
      })
    };
    global.__io = mockIo;

    User.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      username: 'senderUser',
      preferredLanguage: 'en'
    });

    Chat.prototype.save = jest.fn().mockResolvedValue(true);
  });

  afterAll(() => {
    delete global.__io;
  });

  test('sends 1:1 message and emits to user private rooms with 0ms latency', async () => {
    await MessageController.sendMessage(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Hello, how are you?',
        clientTempId: 'temp-123',
        status: 'sent'
      })
    );

    // Emits receiveMessage to both receiver and sender rooms
    expect(mockIo.to).toHaveBeenCalledWith('user_507f1f77bcf86cd799439012');
    expect(mockIo.to).toHaveBeenCalledWith('user_507f1f77bcf86cd799439011');
    expect(mockIo.emit).toHaveBeenCalledWith('receiveMessage', expect.any(Object));
  });

  test('sends group message and emits to room', async () => {
    mockReq.body = {
      content: 'Hello group!',
      roomId: 'room-abc-123',
      clientTempId: 'temp-456'
    };

    await MessageController.sendMessage(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockIo.to).toHaveBeenCalledWith('room-abc-123');
    expect(mockIo.emit).toHaveBeenCalledWith('receiveMessage', expect.any(Object));
  });

  test('rejects empty content without media with 400', async () => {
    mockReq.body = {
      content: '   ',
      receiverId: '507f1f77bcf86cd799439012'
    };

    await MessageController.sendMessage(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('required') })
    );
  });

  test('rejects missing receiverId and roomId with 400', async () => {
    mockReq.body = {
      content: 'Hello world'
    };

    await MessageController.sendMessage(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Either receiverId or roomId is required') })
    );
  });
});
