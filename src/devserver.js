import { spawn } from 'node-pty';
import { exec } from 'node:child_process';

/**
 * Manages dev server processes for projects
 */
export class DevServerManager {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.servers = new Map(); // projectId -> { pty, status, output, restartCount }
    this.maxRestarts = 3;
    this.restartDelay = 3000;
  }

  /**
   * Parse devCommand to extract command and port
   */
  parseCommand(devCommand) {
    if (!devCommand) return null;

    // Try to extract port from common patterns
    const portMatch = devCommand.match(/--port[=\s]+(\d+)|(?:PORT|port)[=](\d+)|-p[=\s]+(\d+)/);
    const port = portMatch ? parseInt(portMatch[1] || portMatch[2] || portMatch[3], 10) : null;

    return { command: devCommand, port };
  }

  /**
   * Check if a port is in use
   */
  async isPortInUse(port) {
    if (!port) return false;

    return new Promise((resolve) => {
      exec(`lsof -i :${port} -t`, (err, stdout) => {
        resolve(stdout.trim().length > 0);
      });
    });
  }

  /**
   * Detect when dev server is ready from output
   */
  isServerReady(output) {
    const readyPatterns = [
      /ready/i,
      /listening on/i,
      /server running/i,
      /started server/i,
      /local:\s*http/i,
      /localhost:\d+/i,
      /127\.0\.0\.1:\d+/i,
      /compiled successfully/i,
      /webpack compiled/i,
      /vite.*ready/i,
      /next.*ready/i,
    ];

    return readyPatterns.some(pattern => pattern.test(output));
  }

  /**
   * Start dev server for a project
   */
  async startServer(project) {
    const { id, path: projectPath, devCommand, previewUrl } = project;

    if (!devCommand) {
      this.logger.log(`[devserver:${id}] No devCommand configured, skipping`);
      return;
    }

    // Check if already running
    if (this.servers.has(id)) {
      const existing = this.servers.get(id);
      if (existing.status !== 'stopped') {
        this.logger.log(`[devserver:${id}] Server already running`);
        return;
      }
    }

    // Try to extract port from previewUrl or devCommand
    let port = null;
    if (previewUrl) {
      const urlMatch = previewUrl.match(/:(\d+)/);
      port = urlMatch ? parseInt(urlMatch[1], 10) : null;
    }
    if (!port) {
      const parsed = this.parseCommand(devCommand);
      port = parsed?.port;
    }

    // Check if port is already in use
    if (port && await this.isPortInUse(port)) {
      this.logger.log(`[devserver:${id}] Port ${port} already in use, assuming server is running externally`);
      this.servers.set(id, {
        pty: null,
        status: 'external',
        output: '',
        restartCount: 0,
        port
      });
      return;
    }

    this.logger.log(`[devserver:${id}] Starting: ${devCommand}`);

    // Parse command - split on first space for shell execution
    const pty = spawn('sh', ['-c', devCommand], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: projectPath,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    const serverState = {
      pty,
      status: 'starting',
      output: '',
      restartCount: this.servers.get(id)?.restartCount || 0,
      port
    };

    this.servers.set(id, serverState);

    pty.onData((data) => {
      serverState.output += data;
      // Keep last 10KB of output
      if (serverState.output.length > 10000) {
        serverState.output = serverState.output.slice(-10000);
      }

      // Check if server is ready
      if (serverState.status === 'starting' && this.isServerReady(serverState.output)) {
        serverState.status = 'running';
        this.logger.log(`[devserver:${id}] Server is ready`);
      }
    });

    pty.onExit(({ exitCode }) => {
      this.logger.log(`[devserver:${id}] Exited with code ${exitCode}`);

      const current = this.servers.get(id);
      if (!current) return;

      current.status = 'stopped';
      current.pty = null;

      // Auto-restart on crash (non-zero exit), but with limit
      if (exitCode !== 0 && exitCode !== null) {
        if (current.restartCount < this.maxRestarts) {
          current.restartCount++;
          this.logger.log(`[devserver:${id}] Will restart in ${this.restartDelay}ms (attempt ${current.restartCount}/${this.maxRestarts})`);
          setTimeout(() => {
            this.startServer(project).catch(err => {
              this.logger.error(`[devserver:${id}] Restart failed:`, err.message);
            });
          }, this.restartDelay);
        } else {
          this.logger.error(`[devserver:${id}] Max restarts reached, giving up`);
          current.status = 'failed';
        }
      }
    });
  }

  /**
   * Start dev servers for all configured projects
   */
  async startAll() {
    this.logger.log('[devserver] Starting dev servers for all projects...');

    for (const project of this.config.projects || []) {
      try {
        await this.startServer(project);
      } catch (err) {
        this.logger.error(`[devserver] Failed to start server for ${project.id}:`, err.message);
      }
    }
  }

  /**
   * Stop dev server for a specific project
   */
  stopServer(projectId) {
    const server = this.servers.get(projectId);
    if (server?.pty) {
      this.logger.log(`[devserver:${projectId}] Stopping server`);
      server.pty.kill();
      server.status = 'stopped';
    }
    this.servers.delete(projectId);
  }

  /**
   * Stop all dev servers
   */
  stopAll() {
    this.logger.log('[devserver] Stopping all dev servers...');
    for (const [id, server] of this.servers) {
      if (server.pty) {
        server.pty.kill();
      }
    }
    this.servers.clear();
  }

  /**
   * Get status for a project's dev server
   */
  getStatus(projectId) {
    const server = this.servers.get(projectId);
    if (!server) {
      return { status: 'not_configured' };
    }
    return {
      status: server.status,
      port: server.port,
      restartCount: server.restartCount,
      // Include last few lines of output for debugging
      recentOutput: server.output.slice(-1000)
    };
  }

  /**
   * Restart dev server for a project
   */
  async restartServer(project) {
    const { id } = project;
    this.logger.log(`[devserver:${id}] Restarting...`);

    // Reset restart count on manual restart
    const server = this.servers.get(id);
    if (server) {
      server.restartCount = 0;
    }

    this.stopServer(id);

    // Wait a moment for port to be released
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.startServer(project);
  }
}
