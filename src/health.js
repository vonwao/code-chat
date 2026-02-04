export class HealthManager {
  constructor({
    config,
    weldrManager,
    devServerManager,
    wss,
    logger = console,
    intervalMs = 15000,
    initialDelayMs = 5000,
    httpTimeoutMs = 5000,
    wsPingIntervalMs = 20000,
    wsPongTimeoutMs = 30000,
    restartCooldownMs = 15000,
    devServerFailureThreshold = 2,
  }) {
    this.config = config;
    this.weldrManager = weldrManager;
    this.devServerManager = devServerManager;
    this.wss = wss;
    this.logger = logger;

    this.intervalMs = intervalMs;
    this.initialDelayMs = initialDelayMs;
    this.httpTimeoutMs = httpTimeoutMs;
    this.wsPingIntervalMs = wsPingIntervalMs;
    this.wsPongTimeoutMs = wsPongTimeoutMs;
    this.restartCooldownMs = restartCooldownMs;
    this.devServerFailureThreshold = devServerFailureThreshold;

    this.timers = new Set();
    this.devServerFailures = new Map();
    this.lastRestartAt = new Map();
    this.checkInFlight = false;
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;

    this.setupWebSocketHeartbeat();

    const initialTimer = setTimeout(() => {
      this.runChecks().catch(err => {
        this.logger.error('[health] Initial checks failed:', err.message);
      });
    }, this.initialDelayMs);
    this.timers.add(initialTimer);

    const intervalTimer = setInterval(() => {
      this.runChecks().catch(err => {
        this.logger.error('[health] Periodic checks failed:', err.message);
      });
    }, this.intervalMs);
    this.timers.add(intervalTimer);
  }

  stop() {
    for (const timer of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.timers.clear();
    this.started = false;
  }

  setupWebSocketHeartbeat() {
    if (!this.wss) return;

    const attachPong = (ws) => {
      ws.isAlive = true;
      ws.lastPong = Date.now();

      if (!ws._healthPongListenerAttached) {
        ws.on('pong', () => {
          ws.isAlive = true;
          ws.lastPong = Date.now();
        });
        ws._healthPongListenerAttached = true;
      }
    };

    this.wss.on('connection', (ws) => {
      attachPong(ws);
    });

    for (const ws of this.wss.clients) {
      if (ws.readyState === 1) {
        attachPong(ws);
      }
    }

    const pingTimer = setInterval(() => {
      const now = Date.now();
      for (const ws of this.wss.clients) {
        if (ws.readyState !== 1) continue;

        const lastPong = ws.lastPong || 0;
        if (now - lastPong > this.wsPongTimeoutMs) {
          this.logger.warn('[health] WebSocket heartbeat timeout, terminating connection');
          ws.terminate();
          continue;
        }

        try {
          ws.isAlive = false;
          ws.ping();
        } catch (err) {
          this.logger.warn('[health] WebSocket ping failed:', err.message);
        }
      }
    }, this.wsPingIntervalMs);

    this.timers.add(pingTimer);
  }

  async runChecks() {
    if (this.checkInFlight) return;
    this.checkInFlight = true;

    try {
      await Promise.all([
        this.checkWeldrDaemons(),
        this.checkDevServers()
      ]);
    } finally {
      this.checkInFlight = false;
    }
  }

  async checkWeldrDaemons() {
    if (!this.weldrManager || !this.weldrManager.weldrPath) return;

    for (const project of this.config.projects || []) {
      const status = this.weldrManager.getDaemonStatus(project.id);
      if (status.running) continue;

      if (!this.canRestart(`weldr:${project.id}`)) continue;

      this.logger.warn(`[health] Weldr daemon not running for ${project.id}, restarting`);
      try {
        await this.weldrManager.startDaemon(project);
      } catch (err) {
        this.logger.error(`[health] Failed to restart weldr daemon for ${project.id}:`, err.message);
      }
    }
  }

  async checkDevServers() {
    if (!this.devServerManager) return;

    for (const project of this.config.projects || []) {
      if (!project.devCommand) continue;

      const status = this.devServerManager.getStatus(project.id);
      await this.checkDevServerStatus(project, status);
    }
  }

  async checkDevServerStatus(project, status) {
    if (!status || status.status === 'not_configured') return;

    const url = this.resolvePreviewUrl(project, status);
    if (url) {
      const ok = await this.checkHttp(url);
      if (!ok) {
        const failures = (this.devServerFailures.get(project.id) || 0) + 1;
        this.devServerFailures.set(project.id, failures);

        this.logger.warn(`[health] Dev server not responding for ${project.id} (${failures}/${this.devServerFailureThreshold})`);

        if (failures >= this.devServerFailureThreshold) {
          if (status.status === 'external') {
            this.logger.warn(`[health] Dev server for ${project.id} is external; skipping restart`);
            this.devServerFailures.set(project.id, 0);
            return;
          }

          if (this.canRestart(`devserver:${project.id}`)) {
            this.logger.warn(`[health] Restarting dev server for ${project.id}`);
            this.devServerFailures.set(project.id, 0);
            try {
              await this.devServerManager.restartServer(project);
            } catch (err) {
              this.logger.error(`[health] Failed to restart dev server for ${project.id}:`, err.message);
            }
          }
        }
      } else {
        this.devServerFailures.set(project.id, 0);
      }
    }

    if (status.status === 'failed' || status.status === 'stopped') {
      if (this.canRestart(`devserver:${project.id}`)) {
        this.logger.warn(`[health] Dev server ${status.status} for ${project.id}, restarting`);
        try {
          await this.devServerManager.restartServer(project);
        } catch (err) {
          this.logger.error(`[health] Failed to restart dev server for ${project.id}:`, err.message);
        }
      }
    }
  }

  resolvePreviewUrl(project, status) {
    if (project.previewUrl) return project.previewUrl;
    if (status?.port) return `http://127.0.0.1:${status.port}`;
    return null;
  }

  async checkHttp(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      this.logger.warn(`[health] Invalid preview URL: ${url}`);
      return false;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      this.logger.warn(`[health] Unsupported preview URL protocol: ${url}`);
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.httpTimeoutMs);

    try {
      await fetch(parsed.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
      return true;
    } catch (err) {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  canRestart(key) {
    const now = Date.now();
    const last = this.lastRestartAt.get(key) || 0;
    if (now - last < this.restartCooldownMs) return false;
    this.lastRestartAt.set(key, now);
    return true;
  }
}
