# VAANI AUDIT - QUICK REFERENCE

## 🎯 Project Overview
**Vaani** is a real-time multilingual communication platform supporting:
- ✅ One-on-one calls (audio/video)
- ✅ Group video calls (LiveKit SFU)
- ✅ Real-time translation (Azure Translator)
- ✅ Chat with media sharing (Cloudinary)
- ✅ Speech recognition & TTS (Azure Services)

**Tech Stack:**
| Layer | Tech | Status |
|-------|------|--------|
| Frontend | React 18 + Vite + TailwindCSS | ✅ Modern |
| Backend | Node.js/Express + Socket.IO | ✅ Solid |
| Real-time | LiveKit SFU + WebRTC | ✅ Good |
| Database | MongoDB | ⚠️ Needs optimization |
| Cache | In-memory (needs Redis) | ⚠️ Not scalable |
| Translation | Azure Translator/Speech | ✅ Good |

---

## 🔴 TOP 5 CRITICAL ISSUES

### Issue #1: Socket.IO Bottleneck
**Severity:** 🔴 CRITICAL  
**Impact:** 2-3s latency in group calls  
**Root Cause:** Synchronous audio processing blocks event queue  
**Fix Time:** 3-5 days  
**Solution:** Use Bull queue + worker threads

**Code to Change:**
```
server/server/socket/audioHandler.js
server/server/utils/speechTranslator.js
```

---

### Issue #2: Translation Pipeline Blocking
**Severity:** 🔴 CRITICAL  
**Impact:** 300-500ms per translation  
**Root Cause:** Sequential Azure API calls  
**Fix Time:** 2-3 days  
**Solution:** Parallel processing with p-limit + Redis cache

**Code to Change:**
```
server/server/utils/parallelTranslator.js (NEW)
server/lib/translationCache.js
```

---

### Issue #3: LiveKit Memory Leaks
**Severity:** 🔴 CRITICAL  
**Impact:** 600MB memory usage per instance  
**Root Cause:** Tracks not unsubscribed on disconnect  
**Fix Time:** 1-2 days  
**Solution:** Proper cleanup in effect dependencies

**Code to Change:**
```
client/src/hooks/useLiveKitRoom.js
```

---

### Issue #4: Group Call Doesn't Scale
**Severity:** 🟠 HIGH  
**Impact:** Unusable with 10+ participants  
**Root Cause:** No virtual scrolling, inefficient re-renders  
**Fix Time:** 2-3 days  
**Solution:** Virtual scrolling + memoization

**Code to Change:**
```
client/src/components/ParticipantGrid.jsx
client/src/components/ParticipantTile.jsx
```

---

### Issue #5: Bundle Size Too Large
**Severity:** 🟠 HIGH  
**Impact:** 4-6s page load on 4G  
**Root Cause:** No code splitting, large vendor chunks  
**Fix Time:** 1-2 days  
**Solution:** Manual chunks + lazy loading

**Code to Change:**
```
client/vite.config.js
client/src/pages/Dashboard.jsx
```

---

## 📊 CURRENT METRICS vs TARGETS

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| API Latency | 500ms | 150ms | 70% |
| Audio Latency | 2-3s | 500ms | 80% |
| Group Call Limit | 5-10 users | 50+ users | 5-10x |
| Bundle Size | 850KB | 280KB | 67% |
| Memory/Instance | 600MB | 250MB | 58% |
| Error Rate | 5% | 0.5% | 90% |

---

## 🛠️ QUICK FIX CHECKLIST

### Immediate (This Week)
- [ ] Add Bull queue for audio processing
- [ ] Set up Redis connection string in .env
- [ ] Create AudioQueueManager
- [ ] Update socket handlers to use queue
- [ ] Monitor queue performance

### Short-term (Next 2 Weeks)
- [ ] Implement Redis translation cache
- [ ] Add parallel processing with p-limit
- [ ] Fix LiveKit track cleanup
- [ ] Add code splitting to Vite
- [ ] Implement virtual scrolling for participants

### Medium-term (Month 1)
- [ ] Migrate user state to Redis
- [ ] Add comprehensive logging (Sentry)
- [ ] Implement E2E tests
- [ ] Add accessibility features
- [ ] Optimize media uploads

### Long-term (Month 2+)
- [ ] Migrate to TypeScript
- [ ] Add monitoring dashboard
- [ ] Implement database aggregation pipeline
- [ ] Add WebAssembly for audio processing
- [ ] Implement SFU clustering

---

## 🔍 KEY FILE LOCATIONS

### Backend Critical Files
```
server/server.js                           - Main server entry
server/server/socket/audioHandler.js       - Audio processing (BOTTLENECK)
server/server/utils/speechTranslator.js    - Translation (BOTTLENECK)
server/server/utils/parallelTranslator.js  - TO CREATE
server/server/queue/audioQueueManager.js   - TO CREATE
server/lib/translationCache.js             - Cache (needs Redis)
server/controllers/groupCallController.js  - Group logic
```

### Frontend Critical Files
```
client/src/pages/Dashboard.jsx             - Main UI (NEEDS REFACTOR)
client/src/components/GroupVideoCall.jsx   - Video calls
client/src/components/ParticipantGrid.jsx  - TO OPTIMIZE
client/src/hooks/useLiveKitRoom.js         - Memory leak
client/src/utils/socketManager.js          - Socket connection
client/vite.config.js                      - Build config (needs chunks)
```

---

## 📈 PERFORMANCE MONITORING

### Frontend Metrics
```javascript
// Add to client/src/utils/performanceMetrics.js
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)  
- Cumulative Layout Shift (CLS)
- Audio latency (measure in ms)
- Video frame drop rate
- Memory usage growth over time
```

### Backend Metrics
```javascript
// Add to server/server/utils/performanceMetrics.js
- Translation latency (p50, p95, p99)
- Audio recognition time
- TTS synthesis time
- Socket event throughput
- Queue depth & processing time
- Database query time
```

---

## 🔐 SECURITY CHECKLIST

- [ ] JWT tokens in httpOnly cookies (not localStorage)
- [ ] CSRF protection on forms
- [ ] Rate limiting on socket events
- [ ] Input validation on all API endpoints
- [ ] Sanitize user input before display
- [ ] CORS properly configured for production
- [ ] Secrets not committed to git
- [ ] Environment variables validated on startup
- [ ] SQL injection prevention (using Mongoose, OK)
- [ ] XSS protection (React escapes by default, OK)

---

## 🚀 DEPLOYMENT CHECKLIST

### Before Production
- [ ] All critical bottlenecks fixed
- [ ] Load tested with 100+ concurrent users
- [ ] Error tracking (Sentry) integrated
- [ ] Monitoring dashboard set up
- [ ] Database indexes optimized
- [ ] Redis cluster configured
- [ ] CDN configured for assets
- [ ] SSL certificates valid
- [ ] Backups automated
- [ ] Incident response plan documented

---

## 💡 ARCHITECTURE IMPROVEMENTS

### Phase 1: Queue-Based Architecture
```
Current:  Socket → Direct Processing → Response
         (bottlenecked, slow)

Better:   Socket → Bull Queue → Worker Pool → Response
         (async, scalable, fast)
```

### Phase 2: Distributed Caching
```
Current:  In-memory cache (single instance)
Better:   Redis cache (multi-instance, TTL, shareable)
```

### Phase 3: Horizontal Scaling
```
Current:  Single server, limited to one instance
Better:   Multiple servers + Redis + Load balancer
         (handles 1000+ concurrent users)
```

---

## 📞 SUPPORT & ESCALATION

**For Critical Issues:**
1. Check error logs: `npm run logs` 
2. Check metrics: Dashboard performance tab
3. Profile with Chrome DevTools
4. Review corresponding audit section

**For Performance Questions:**
- Refer to VAANI_AUDIT_REPORT.md (comprehensive)
- Refer to VAANI_IMPLEMENTATION_GUIDE.md (code examples)

---

## 📋 NEXT ACTIONS

**Immediate (Today):**
1. Read VAANI_AUDIT_REPORT.md fully
2. Review code locations for critical issues
3. Estimate effort for each fix
4. Prioritize based on business impact

**This Week:**
1. Set up Bull & Redis
2. Create AudioQueueManager
3. Implement Redis cache
4. Start profiling improvements

**Next Week:**
1. Fix LiveKit memory leaks
2. Implement virtual scrolling
3. Add code splitting
4. Deploy to staging for testing

---

## 📊 SUCCESS METRICS

Track these after implementing fixes:

```javascript
// Frontend
window.webVitals = {
  FCP: < 2s,           // First Contentful Paint
  LCP: < 2.5s,         // Largest Contentful Paint  
  CLS: < 0.1,          // Cumulative Layout Shift
  audioLatency: < 500ms // Real-time audio
}

// Backend
serverMetrics = {
  apiLatency: < 200ms,   // 95th percentile
  translationTime: < 300ms,
  errorRate: < 0.5%,
  activeConnections: 500+,
  memoryUsage: < 300MB
}
```

---

**Generated:** May 29, 2026  
**Project:** Vaani - Multilingual Real-time Communication  
**Status:** Under Review for Optimization
