const { encrypt, decrypt, maskKey } = require('../crypto');
const { requireRole } = require('../../middleware/auth');

describe('Crypto Utility', () => {
  test('encrypt and decrypt should perform round-trip correctly', () => {
    const plain = 'sk-livekit-secret-key-1234567890';
    const encrypted = encrypt(plain);

    expect(encrypted).not.toBe(plain);
    expect(encrypted.split(':')).toHaveLength(3); // iv:ciphertext:tag

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plain);
  });

  test('decrypt returns unchanged string if not formatted as iv:ciphertext:tag', () => {
    expect(decrypt('plain-text')).toBe('plain-text');
    expect(decrypt('')).toBe('');
    expect(decrypt(null)).toBe(null);
  });

  test('maskKey properly masks secret keys', () => {
    expect(maskKey('short')).toBe('••••••••');
    expect(maskKey('12345678')).toBe('••••••••');
    expect(maskKey('abcdef123456')).toBe('••••••••3456');
    expect(maskKey('')).toBe('');
    expect(maskKey(null)).toBe('');
  });
});

describe('RBAC requireRole Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: null };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  test('rejects unauthenticated request with 401', () => {
    const middleware = requireRole('admin');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects user without required role with 403', () => {
    req.user = { role: 'user' };
    const middleware = requireRole('admin');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows user with matching role', () => {
    req.user = { role: 'admin' };
    const middleware = requireRole('admin');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('superadmin always passes any requireRole check', () => {
    req.user = { role: 'superadmin' };
    const middleware = requireRole('admin');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('allows access if one of multiple roles matches', () => {
    req.user = { role: 'moderator' };
    const middleware = requireRole('admin', 'moderator');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
