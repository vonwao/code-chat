/**
 * Claude Session Monitor
 * 
 * Detects stuck Claude Code sessions by monitoring:
 * - Total runtime (timeout)
 * - Repeated output patterns (loop detection)
 * - Activity gaps (stall detection)
 */

export class ClaudeMonitor {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || 30 * 60 * 1000;  // 30 minutes default
    this.loopThreshold = options.loopThreshold || 5;       // Same pattern 5x = loop
    this.loopWindowSize = options.loopWindowSize || 50;    // Check last 50 chunks
    this.stallMs = options.stallMs || 5 * 60 * 1000;       // 5 min no output = stall
    this.progressIntervalMs = options.progressIntervalMs || 30000; // Report every 30s
    this.logger = options.logger || console;
    
    this.sessions = new Map();
  }

  /**
   * Start monitoring a Claude session
   */
  startSession(sessionId, { onTimeout, onLoopDetected, onStall, onProgress }) {
    const session = {
      id: sessionId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      outputChunks: [],
      patternCounts: new Map(),
      callbacks: { onTimeout, onLoopDetected, onStall, onProgress },
      timers: {},
      killed: false,
    };

    // Timeout timer
    session.timers.timeout = setTimeout(() => {
      if (!session.killed) {
        this.logger.warn(`[monitor] Session ${sessionId} timed out after ${this.timeoutMs / 60000} minutes`);
        session.callbacks.onTimeout?.({
          elapsed: Date.now() - session.startTime,
          reason: 'timeout',
        });
      }
    }, this.timeoutMs);

    // Progress reporter
    session.timers.progress = setInterval(() => {
      if (!session.killed) {
        const elapsed = Date.now() - session.startTime;
        const sinceActivity = Date.now() - session.lastActivity;
        session.callbacks.onProgress?.({
          elapsed,
          sinceActivity,
          outputSize: session.outputChunks.join('').length,
          loopSuspicion: this.getLoopSuspicion(session),
        });
      }
    }, this.progressIntervalMs);

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Record output from Claude
   */
  recordOutput(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session || session.killed) return;

    session.lastActivity = Date.now();
    
    // Store chunk for pattern analysis
    const chunk = this.normalizeChunk(data);
    if (chunk) {
      session.outputChunks.push(chunk);
      
      // Keep window size manageable
      if (session.outputChunks.length > this.loopWindowSize * 2) {
        session.outputChunks = session.outputChunks.slice(-this.loopWindowSize);
      }

      // Check for loops
      this.detectLoop(session);
    }
  }

  /**
   * Normalize output chunk for pattern matching
   * Extracts meaningful patterns like todo items, file operations, etc.
   */
  normalizeChunk(data) {
    const str = typeof data === 'string' ? data : data.toString();
    
    // Extract todo items (common loop indicator)
    const todoMatch = str.match(/(?:TODO|Todo|✓|☐|→)\s*(.{10,50})/);
    if (todoMatch) return `TODO:${todoMatch[1].trim()}`;
    
    // Extract file operations
    const fileMatch = str.match(/(?:Read|Write|Edit|Create|Delete)\s+([^\s]+)/i);
    if (fileMatch) return `FILE:${fileMatch[1]}`;
    
    // Extract test runs
    const testMatch = str.match(/(?:Test|test|PASS|FAIL|Error)/);
    if (testMatch) return `TEST:${testMatch[0]}`;
    
    // If chunk is substantial, hash it for comparison
    if (str.length > 100) {
      return `HASH:${this.simpleHash(str)}`;
    }
    
    return null;
  }

  /**
   * Simple hash for comparing chunks
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Detect repeated patterns indicating a loop
   */
  detectLoop(session) {
    const recent = session.outputChunks.slice(-this.loopWindowSize);
    
    // Count pattern occurrences
    const counts = new Map();
    for (const chunk of recent) {
      counts.set(chunk, (counts.get(chunk) || 0) + 1);
    }

    // Find patterns that repeat too often
    for (const [pattern, count] of counts) {
      if (count >= this.loopThreshold) {
        // Only alert once per pattern
        if (!session.patternCounts.has(pattern) || session.patternCounts.get(pattern) < count) {
          session.patternCounts.set(pattern, count);
          
          this.logger.warn(`[monitor] Session ${session.id} loop detected: "${pattern}" repeated ${count} times`);
          
          session.callbacks.onLoopDetected?.({
            pattern,
            count,
            elapsed: Date.now() - session.startTime,
          });
        }
      }
    }
  }

  /**
   * Get a "loop suspicion" score (0-100)
   */
  getLoopSuspicion(session) {
    if (session.outputChunks.length < 10) return 0;
    
    const recent = session.outputChunks.slice(-this.loopWindowSize);
    const counts = new Map();
    for (const chunk of recent) {
      counts.set(chunk, (counts.get(chunk) || 0) + 1);
    }

    // Find max repetition
    let maxCount = 0;
    for (const count of counts.values()) {
      if (count > maxCount) maxCount = count;
    }

    // Scale to 0-100
    return Math.min(100, Math.round((maxCount / this.loopThreshold) * 50));
  }

  /**
   * Extend timeout for a session
   */
  extendTimeout(sessionId, additionalMs) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    clearTimeout(session.timers.timeout);
    
    const remaining = (session.startTime + this.timeoutMs) - Date.now() + additionalMs;
    
    session.timers.timeout = setTimeout(() => {
      if (!session.killed) {
        this.logger.warn(`[monitor] Session ${sessionId} timed out (extended)`);
        session.callbacks.onTimeout?.({
          elapsed: Date.now() - session.startTime,
          reason: 'timeout_extended',
        });
      }
    }, Math.max(0, remaining));

    this.logger.info(`[monitor] Session ${sessionId} timeout extended by ${additionalMs / 60000} minutes`);
    return true;
  }

  /**
   * End monitoring for a session
   */
  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.killed = true;
    clearTimeout(session.timers.timeout);
    clearInterval(session.timers.progress);
    
    const elapsed = Date.now() - session.startTime;
    this.logger.info(`[monitor] Session ${sessionId} ended after ${Math.round(elapsed / 1000)}s`);
    
    this.sessions.delete(sessionId);
  }

  /**
   * Get session stats
   */
  getSessionStats(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      elapsed: Date.now() - session.startTime,
      sinceActivity: Date.now() - session.lastActivity,
      outputSize: session.outputChunks.join('').length,
      loopSuspicion: this.getLoopSuspicion(session),
      patternCounts: Object.fromEntries(session.patternCounts),
    };
  }
}

export default ClaudeMonitor;
