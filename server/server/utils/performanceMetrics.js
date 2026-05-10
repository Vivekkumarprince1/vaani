/**
 * Performance Metrics Tracker for Voice Translation
 * Tracks end-to-end latency breakdown for optimization analysis
 */

class PerformanceMetrics {
  constructor() {
    this.metrics = [];
    this.maxHistorySize = 100; // Keep last 100 measurements
  }

  /**
   * Create a new metric measurement
   * @param {string} requestId - Unique request identifier
   * @returns {Object} - Metric tracker object
   */
  startTracking(requestId) {
    const metric = {
      requestId,
      timestamps: {
        audioCapture: null,
        audioProcessed: null,
        serverReceived: null,
        recognitionStart: null,
        recognitionEnd: null,
        translationStart: null,
        translationEnd: null,
        clientReceived: null,
        displayed: null
      },
      durations: {
        audioProcessing: 0,    // Capture → Process
        transmission: 0,        // Process → Server
        recognition: 0,         // Recognition time
        translation: 0,         // Translation time
        serverTotal: 0,         // Server receive → Send
        returnTransmission: 0,  // Server → Client
        display: 0,             // Client receive → Display
        endToEnd: 0            // Total time
      }
    };

    return metric;
  }

  /**
   * Record timestamp for a specific phase
   * @param {Object} metric - Metric object
   * @param {string} phase - Phase name
   */
  recordTimestamp(metric, phase) {
    if (metric && metric.timestamps) {
      metric.timestamps[phase] = Date.now();
      this._calculateDurations(metric);
    }
  }

  /**
   * Calculate durations between phases
   * @private
   */
  _calculateDurations(metric) {
    const ts = metric.timestamps;
    const dur = metric.durations;

    // Audio processing time
    if (ts.audioCapture && ts.audioProcessed) {
      dur.audioProcessing = ts.audioProcessed - ts.audioCapture;
    }

    // Transmission to server
    if (ts.audioProcessed && ts.serverReceived) {
      dur.transmission = ts.serverReceived - ts.audioProcessed;
    }

    // Recognition time
    if (ts.recognitionStart && ts.recognitionEnd) {
      dur.recognition = ts.recognitionEnd - ts.recognitionStart;
    }

    // Translation time
    if (ts.translationStart && ts.translationEnd) {
      dur.translation = ts.translationEnd - ts.translationStart;
    }

    // Total server time
    if (ts.serverReceived && ts.translationEnd) {
      dur.serverTotal = ts.translationEnd - ts.serverReceived;
    }

    // Return transmission
    if (ts.translationEnd && ts.clientReceived) {
      dur.returnTransmission = ts.clientReceived - ts.translationEnd;
    }

    // Display time
    if (ts.clientReceived && ts.displayed) {
      dur.display = ts.displayed - ts.clientReceived;
    }

    // End-to-end
    // Attempt full end-to-end (audioCapture -> displayed). If audioCapture
    // is missing, compute a partial end-to-end from the earliest available
    // timestamp to displayed so we can still reason about end-to-end when
    // upstream timestamps are unavailable.
    if (ts.displayed) {
      if (ts.audioCapture) {
        dur.endToEnd = ts.displayed - ts.audioCapture;
      } else {
        // find earliest non-null timestamp as a fallback
        const earliest = this._earliestTimestamp(ts);
        if (earliest) {
          dur.endToEnd = ts.displayed - earliest;
          // mark as partial by storing a special flag on metric (non-enumerable)
          try {
            Object.defineProperty(metric, '_partialEndToEndFrom', {
              value: earliest,
              enumerable: false,
              writable: true
            });
          } catch (e) {
            // ignore if environment doesn't allow defineProperty (very unlikely)
          }
        }
      }
    }
  }

  /**
   * Return the earliest (smallest) timestamp value from the timestamps object
   * excluding nulls. Returns null when no timestamps exist.
   * @private
   */
  _earliestTimestamp(timestamps) {
    const vals = Object.values(timestamps).filter(v => v && typeof v === 'number');
    if (vals.length === 0) return null;
    return Math.min(...vals);
  }

  /**
   * Complete metric and add to history
   * @param {Object} metric - Completed metric
   */
  complete(metric) {
    this._calculateDurations(metric);
    
    // Add to history
    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxHistorySize) {
      this.metrics.shift();
    }

    // Log detailed breakdown
    this.logMetric(metric);
  }

  /**
   * Log metric details to console
   * @param {Object} metric - Metric to log
   */
  logMetric(metric) {
    const dur = metric.durations;
    
    console.log(`\n📊 Performance Metrics - Request: ${metric.requestId}`);
    console.log(`┌─────────────────────────────────────────────────┐`);
    console.log(`│ Phase                    │ Duration            │`);
    console.log(`├─────────────────────────────────────────────────┤`);
    console.log(`│ 🎤 Audio Processing     │ ${this._formatDuration(dur.audioProcessing)} │`);
    console.log(`│ 📡 Transmission          │ ${this._formatDuration(dur.transmission)} │`);
    console.log(`│ 🎯 Recognition           │ ${this._formatDuration(dur.recognition)} │`);
    console.log(`│ 🌍 Translation           │ ${this._formatDuration(dur.translation)} │`);
    console.log(`│ 🖥️  Server Total         │ ${this._formatDuration(dur.serverTotal)} │`);
    console.log(`│ 🔊 TTS & Return Trans    │ ${this._formatDuration(dur.returnTransmission)} │`);
    console.log(`│ 🖼️  Display Render       │ ${this._formatDuration(dur.display)} │`);
    console.log(`├─────────────────────────────────────────────────┤`);
    console.log(`│ ⚡ TOTAL END-TO-END     │ ${this._formatDuration(dur.endToEnd)} │`);
    console.log(`└─────────────────────────────────────────────────┘`);

    // Add performance assessment
    this._logPerformanceAssessment(dur.endToEnd);
  }

  /**
   * Format duration for display
   * @private
   */
  _formatDuration(ms) {
    if (!ms || ms === 0) return '     -    ';
    
    const str = `${Math.round(ms)}ms`;
    return str.padStart(10, ' ');
  }

  /**
   * Log performance assessment
   * @private
   */
  _logPerformanceAssessment(endToEnd) {
    if (endToEnd < 1000) {
      console.log(`\n✅ Excellent Performance (< 1s)`);
    } else if (endToEnd < 1500) {
      console.log(`\n⚠️  Acceptable Performance (1-1.5s)`);
    } else {
      console.log(`\n❌ Poor Performance (> 1.5s)`);
    }
  }

  /**
   * Get average metrics across all measurements
   * @returns {Object} - Average durations
   */
  getAverages() {
    if (this.metrics.length === 0) return null;

    const sums = {
      audioProcessing: 0,
      transmission: 0,
      recognition: 0,
      translation: 0,
      serverTotal: 0,
      returnTransmission: 0,
      display: 0,
      endToEnd: 0
    };

    let count = this.metrics.length;

    this.metrics.forEach(m => {
      Object.keys(sums).forEach(key => {
        sums[key] += m.durations[key] || 0;
      });
    });

    const averages = {};
    Object.keys(sums).forEach(key => {
      averages[key] = Math.round(sums[key] / count);
    });

    return averages;
  }

  /**
   * Print summary statistics
   */
  printSummary() {
    const averages = this.getAverages();
    
    if (!averages) {
      console.log('No metrics recorded yet');
      return;
    }

    console.log(`\n📈 Performance Summary (${this.metrics.length} requests)`);
    console.log(`┌─────────────────────────────────────────────────┐`);
    console.log(`│ Average Audio Processing    │ ${this._formatDuration(averages.audioProcessing)} │`);
    console.log(`│ Average Transmission        │ ${this._formatDuration(averages.transmission)} │`);
    console.log(`│ Average Recognition         │ ${this._formatDuration(averages.recognition)} │`);
    console.log(`│ Average Translation         │ ${this._formatDuration(averages.translation)} │`);
    console.log(`│ Average Server Total        │ ${this._formatDuration(averages.serverTotal)} │`);
    console.log(`├─────────────────────────────────────────────────┤`);
    console.log(`│ Average END-TO-END          │ ${this._formatDuration(averages.endToEnd)} │`);
    console.log(`└─────────────────────────────────────────────────┘`);
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
    console.log('🗑️ Performance metrics cleared');
  }

  /**
   * Get percentile value
   * @param {string} phase - Phase name
   * @param {number} percentile - Percentile (e.g., 95)
   * @returns {number} - Percentile value
   */
  getPercentile(phase, percentile) {
    const values = this.metrics
      .map(m => m.durations[phase])
      .filter(v => v > 0)
      .sort((a, b) => a - b);

    if (values.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[index];
  }

  /**
   * Export metrics data
   * @returns {Array} - Metrics array
   */
  export() {
    return JSON.parse(JSON.stringify(this.metrics));
  }
}

// Create singleton instance
const performanceMetrics = new PerformanceMetrics();

module.exports = performanceMetrics;
