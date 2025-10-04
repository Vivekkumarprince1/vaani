// Simple in-memory TTL cache for translations
const cache = new Map();

function makeEntry(value, ttlMs) {
  return {
    value,
    expiresAt: Date.now() + ttlMs
  };
}

// Default TTL: 7 days
const DEFAULT_TTL = 1000 * 60 * 60 * 24 * 7;

export function makeKey(text, target, source) {
  const safeText = typeof text === 'string' ? text : JSON.stringify(text);
  const b64 = Buffer.from(safeText).toString('base64');
  return `${target}:${source || 'auto'}:${b64}`;
}

export function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function set(key, value, ttlMs = DEFAULT_TTL) {
  cache.set(key, makeEntry(value, ttlMs));
}

export function getMany(keys) {
  const result = new Map();
  for (const k of keys) {
    const v = get(k);
    if (v !== null && v !== undefined) result.set(k, v);
  }
  return result;
}

export function setMany(map, ttlMs = DEFAULT_TTL) {
  for (const [k, v] of map.entries()) set(k, v, ttlMs);
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of cache.entries()) {
    if (entry.expiresAt < now) cache.delete(k);
  }
}, 1000 * 60 * 60); // hourly

export default { makeKey, get, set, getMany, setMany };
