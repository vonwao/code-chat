import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Manages weldr daemon processes for projects
 */
export class WeldrManager {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.daemons = new Map(); // projectId -> process
    this.weldrPath = null;
  }

  /**
   * Check if weldr is installed
   */
  async checkWeldr() {
    return new Promise((resolve) => {
      const which = spawn('which', ['weldr']);
      let path = '';
      
      which.stdout.on('data', (data) => {
        path += data.toString().trim();
      });
      
      which.on('close', (code) => {
        if (code === 0 && path) {
          this.weldrPath = path;
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  /**
   * Check if a project has weldr initialized
   */
  isInitialized(projectPath) {
    return existsSync(join(projectPath, '.weldr', 'config.json'));
  }

  /**
   * Initialize weldr in a project
   */
  async initProject(projectPath) {
    return new Promise((resolve, reject) => {
      this.logger.log(`[weldr] Initializing weldr in ${projectPath}`);
      
      const proc = spawn('weldr', ['init'], {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`[weldr] Initialized ${projectPath}`);
          resolve();
        } else {
          reject(new Error(`weldr init failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Start weldr daemon for a project
   */
  async startDaemon(project) {
    const { id, path: projectPath } = project;

    // Check if already running
    if (this.daemons.has(id)) {
      const existing = this.daemons.get(id);
      if (!existing.killed) {
        this.logger.log(`[weldr] Daemon already running for ${id}`);
        return;
      }
    }

    // Check if initialized
    if (!this.isInitialized(projectPath)) {
      this.logger.log(`[weldr] Project not initialized, initializing: ${id}`);
      try {
        await this.initProject(projectPath);
      } catch (err) {
        this.logger.error(`[weldr] Failed to initialize ${id}:`, err.message);
        return;
      }
    }

    // Build daemon args
    const args = ['daemon'];
    
    if (this.config.weldr?.syncUrl) {
      args.push('--sync-url', this.config.weldr.syncUrl);
    }
    
    if (this.config.weldr?.syncToken) {
      args.push('--sync-token', this.config.weldr.syncToken);
    }

    this.logger.log(`[weldr] Starting daemon for ${id}: weldr ${args.join(' ')}`);

    const daemon = spawn('weldr', args, {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });

    daemon.stdout.on('data', (data) => {
      this.logger.log(`[weldr:${id}] ${data.toString().trim()}`);
    });

    daemon.stderr.on('data', (data) => {
      this.logger.error(`[weldr:${id}] ${data.toString().trim()}`);
    });

    daemon.on('close', (code) => {
      this.logger.log(`[weldr:${id}] Daemon exited with code ${code}`);
      this.daemons.delete(id);
      
      // Auto-restart after 5 seconds if unexpected exit
      if (code !== 0 && code !== null) {
        this.logger.log(`[weldr:${id}] Will restart in 5 seconds...`);
        setTimeout(() => {
          this.startDaemon(project).catch(err => {
            this.logger.error(`[weldr:${id}] Restart failed:`, err.message);
          });
        }, 5000);
      }
    });

    daemon.on('error', (err) => {
      this.logger.error(`[weldr:${id}] Daemon error:`, err.message);
    });

    this.daemons.set(id, daemon);
  }

  /**
   * Start daemons for all configured projects
   */
  async startAll() {
    const hasWeldr = await this.checkWeldr();
    
    if (!hasWeldr) {
      this.logger.warn('[weldr] weldr not installed, skipping daemon integration');
      this.logger.warn('[weldr] Install: https://github.com/vonwao/weldr-v3');
      return;
    }

    this.logger.log(`[weldr] Found weldr at ${this.weldrPath}`);

    for (const project of this.config.projects || []) {
      try {
        await this.startDaemon(project);
      } catch (err) {
        this.logger.error(`[weldr] Failed to start daemon for ${project.id}:`, err.message);
      }
    }
  }

  /**
   * Stop daemon for a specific project
   */
  stopDaemon(projectId) {
    const daemon = this.daemons.get(projectId);
    if (daemon && !daemon.killed) {
      this.logger.log(`[weldr] Stopping daemon for ${projectId}`);
      daemon.kill('SIGTERM');
    }
    this.daemons.delete(projectId);
  }

  /**
   * Stop all daemons
   */
  stopAll() {
    this.logger.log('[weldr] Stopping all daemons...');
    for (const [id, daemon] of this.daemons) {
      if (!daemon.killed) {
        daemon.kill('SIGTERM');
      }
    }
    this.daemons.clear();
  }

  /**
   * Get status for a project
   */
  getDaemonStatus(projectId) {
    const daemon = this.daemons.get(projectId);
    return {
      running: daemon && !daemon.killed,
      pid: daemon?.pid
    };
  }
}
