// ✅ OPTIMIZED: In-memory TTL cache for translations with metrics
const cache = new Map();
let hits = 0;
let misses = 0;

function makeEntry(value, ttlMs) {
  return {
    value,
    expiresAt: Date.now() + ttlMs,
    createdAt: Date.now()
  };
}

// Default TTL: 7 days
const DEFAULT_TTL = 1000 * 60 * 60 * 24 * 7;

function makeKey(text, target, source) {
  const safeText = typeof text === 'string' ? text : JSON.stringify(text);
  const b64 = Buffer.from(safeText).toString('base64');
  return `${target}:${source || 'auto'}:${b64}`;
}

function get(key) {
  const entry = cache.get(key);
  if (!entry) {
    misses++;
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    misses++;
    return null;
  }
  hits++;
  return entry.value;
}

function set(key, value, ttlMs = DEFAULT_TTL) {
  cache.set(key, makeEntry(value, ttlMs));
}

function getMany(keys) {
  const result = new Map();
  for (const k of keys) {
    const v = get(k);
    if (v !== null && v !== undefined) result.set(k, v);
  }
  return result;
}

function setMany(map, ttlMs = DEFAULT_TTL) {
  for (const [k, v] of map.entries()) set(k, v, ttlMs);
}

// ✅ OPTIMIZED: Cache statistics and metrics
function getStats() {
  const total = hits + misses;
  return {
    size: cache.size,
    hits,
    misses,
    hitRate: getHitRate(),
    totalRequests: total
  };
}

function getHitRate() {
  const total = hits + misses;
  return total === 0 ? 0 : (hits / total) * 100;
}

function printStats() {
  const stats = getStats();
  console.log('📊 Translation Cache Statistics:');
  console.log(`   ├─ Size: ${stats.size} entries`);
  console.log(`   ├─ Hits: ${stats.hits}`);
  console.log(`   ├─ Misses: ${stats.misses}`);
  console.log(`   ├─ Hit Rate: ${stats.hitRate.toFixed(1)}%`);
  console.log(`   └─ Total Requests: ${stats.totalRequests}`);
}

function clear() {
  cache.clear();
  hits = 0;
  misses = 0;
  console.log('🗑️ Translation cache cleared');
}

// Periodic cleanup with unref so it does not prevent process exit
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [k, entry] of cache.entries()) {
    if (entry.expiresAt < now) {
      cache.delete(k);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
  }
}, 1000 * 60 * 60); // hourly

if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

module.exports = { makeKey, get, set, getMany, setMany, getStats, getHitRate, printStats, clear };
module.exports.default = module.exports;
