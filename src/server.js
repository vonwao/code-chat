import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'node-pty';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { execFile, execSync } from 'child_process';
import { WeldrManager } from './weldr.js';
import { DevServerManager } from './devserver.js';
import { HealthManager } from './health.js';
import {
  normalizeAuthConfig,
  isValidKey,
  validateKey,
  canAccessProject,
  filterProjectsForUser,
  getKeyFromHttpRequest,
  getKeyFromWebSocketRequest,
} from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
const configPath = process.env.CONFIG_PATH || join(__dirname, '../config.json');
let config = { projects: [], port: 3000 };
if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
}
const authConfig = normalizeAuthConfig(config);

if (authConfig.enabled && Object.keys(authConfig.keys).length === 0) {
  console.warn('[auth] Enabled, but no keys configured. All requests will be rejected.');
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(join(__dirname, '../public')));

// API: Auth status
app.get('/api/auth', (req, res) => {
  res.json({ enabled: authConfig.enabled });
});

function requireAuth(req, res, next) {
  if (!authConfig.enabled) {
    req.user = { name: 'Anonymous', projects: '*' };
    return next();
  }

  const key = getKeyFromHttpRequest(req);
  const result = validateKey(authConfig, key);
  
  if (result.valid) {
    req.user = result.user;
    return next();
  }

  res.status(401).json({ error: 'Unauthorized' });
}

// API: List projects (filtered by user access)
app.get('/api/projects', requireAuth, (req, res) => {
  const accessibleProjects = filterProjectsForUser(config.projects, req.user);
  res.json(accessibleProjects.map(p => ({
    id: p.id,
    name: p.name,
    previewUrl: p.previewUrl,
  })));
});

// API: Get weldr sync status for a project
app.get('/api/projects/:id/sync-status', requireAuth, async (req, res) => {
  const project = config.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    // Run weldr status and parse output
    const { execSync } = await import('child_process');
    const output = execSync('weldr status', { 
      cwd: project.path,
      encoding: 'utf-8',
      timeout: 5000
    });

    // Parse the output
    const syncMatch = output.match(/Sync status\s+(\w+)/);
    const jjMatch = output.match(/JJ status\s+(\w+)/);
    const lastSyncMatch = output.match(/Last sync\s+(.+)/);

    res.json({
      syncStatus: syncMatch ? syncMatch[1] : 'unknown',
      jjStatus: jjMatch ? jjMatch[1] : 'unknown',
      lastSync: lastSyncMatch ? lastSyncMatch[1].trim() : 'never',
      daemonRunning: weldrManager.getDaemonStatus(project.id).running
    });
  } catch (err) {
    res.json({
      syncStatus: 'error',
      jjStatus: 'unknown',
      lastSync: 'never',
      daemonRunning: weldrManager.getDaemonStatus(project.id).running,
      error: err.message
    });
  }
});

// API: Get dev server status for a project
app.get('/api/projects/:id/devserver-status', requireAuth, (req, res) => {
  const project = config.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const status = devServerManager.getStatus(project.id);
  res.json(status);
});

// API: Restart dev server for a project
app.post('/api/projects/:id/devserver-restart', requireAuth, async (req, res) => {
  const project = config.projects.find(p => p.id === req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    await devServerManager.restartServer(project);
    res.json({ success: true, message: 'Dev server restarting' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track active PTY sessions
const sessions = new Map();

wss.on('connection', (ws, req) => {
  let currentPty = null;
  let currentProjectId = null;
  let isAuthenticated = !authConfig.enabled;
  let currentUser = authConfig.enabled ? null : { name: 'Anonymous', projects: '*' };

  if (authConfig.enabled) {
    const key = getKeyFromWebSocketRequest(req);
    if (key) {
      const result = validateKey(authConfig, key);
      if (result.valid) {
        isAuthenticated = true;
        currentUser = result.user;
      } else {
        ws.close(1008, 'Invalid API key');
        return;
      }
    } else {
      ws.send(JSON.stringify({ type: 'auth_required', message: 'API key required' }));
    }
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (authConfig.enabled && !isAuthenticated) {
      if (msg.type === 'auth') {
        const result = validateKey(authConfig, msg.key);
        if (result.valid) {
          isAuthenticated = true;
          currentUser = result.user;
          ws.send(JSON.stringify({ 
            type: 'auth_ok', 
            user: { name: currentUser.name }
          }));
          return;
        }

        ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid API key' }));
        ws.close(1008, 'Invalid API key');
        return;
      }

      ws.send(JSON.stringify({ type: 'auth_required', message: 'API key required' }));
      return;
    }

    switch (msg.type) {
      case 'select_project':
        if (handleSelectProject(ws, msg.projectId, currentUser)) {
          currentProjectId = msg.projectId;
        }
        break;

      case 'chat':
        if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No project selected' }));
          return;
        }
        handleChat(ws, currentProjectId, msg.prompt, (pty) => {
          currentPty = pty;
        });
        break;

      case 'cancel':
        if (currentPty) {
          currentPty.kill();
          currentPty = null;
          ws.send(JSON.stringify({ type: 'cancelled' }));
        }
        break;

      case 'undo':
        if (!currentProjectId) return;
        handleUndo(ws, currentProjectId);
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    if (currentPty) {
      currentPty.kill();
    }
  });
});

function handleSelectProject(ws, projectId, user) {
  const project = config.projects.find(p => p.id === projectId);
  if (!project) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown project: ${projectId}` }));
    return false;
  }
  
  // Check if user has access to this project
  if (!canAccessProject(user, projectId)) {
    ws.send(JSON.stringify({ type: 'error', message: `Access denied to project: ${projectId}` }));
    return false;
  }
  
  ws.send(JSON.stringify({
    type: 'project_selected',
    project: {
      id: project.id,
      name: project.name,
      previewUrl: project.previewUrl,
    }
  }));
  return true;
}

function handleChat(ws, projectId, prompt, setPty) {
  const project = config.projects.find(p => p.id === projectId);
  if (!project) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown project: ${projectId}` }));
    return;
  }

  ws.send(JSON.stringify({ type: 'thinking' }));

  // Find claude in common locations
  const claudePath = findExecutable('claude');
  if (!claudePath) {
    console.error('[chat] Claude CLI not found in PATH');
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Claude CLI not found. Make sure `claude` is installed and in your PATH.' 
    }));
    return;
  }

  let pty;
  try {
    // Spawn Claude Code with the prompt
    // Using -p for print mode (non-interactive) and --dangerously-skip-permissions
    pty = spawn(claudePath, [
      '-p', prompt,
      '--dangerously-skip-permissions'
    ], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: project.path,
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });
  } catch (err) {
    console.error('[chat] Failed to spawn Claude:', err.message);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: `Failed to start Claude: ${err.message}` 
    }));
    return;
  }

  setPty(pty);

  let outputBuffer = '';

  pty.onData((data) => {
    outputBuffer += data;
    ws.send(JSON.stringify({
      type: 'output',
      data: data,
    }));
  });

  pty.onExit(({ exitCode }) => {
    ws.send(JSON.stringify({
      type: 'done',
      exitCode,
    }));
    sendModifiedFiles(ws, project.path);
  });
}

// Find an executable in PATH or common locations
function findExecutable(name) {
  // First try which
  try {
    const result = execSync(`which ${name}`, { encoding: 'utf-8' }).trim();
    if (result) return result;
  } catch {}
  
  // Check common locations
  const commonPaths = [
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `${process.env.HOME}/.local/bin/${name}`,
    `${process.env.HOME}/.npm-global/bin/${name}`,
  ];
  
  for (const p of commonPaths) {
    try {
      if (existsSync(p)) return p;
    } catch {}
  }
  
  return null;
}

function handleUndo(ws, projectId) {
  const project = config.projects.find(p => p.id === projectId);
  if (!project) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown project: ${projectId}` }));
    return;
  }

  ws.send(JSON.stringify({ type: 'undoing' }));

  // Use jj undo if available, otherwise git checkout
  const pty = spawn('jj', ['undo'], {
    cwd: project.path,
    env: process.env,
  });

  let output = '';
  pty.onData((data) => {
    output += data;
  });

  pty.onExit(({ exitCode }) => {
    if (exitCode === 0) {
      ws.send(JSON.stringify({ type: 'undo_done', message: 'Changes undone!' }));
    } else {
      // Try git if jj failed
      const gitPty = spawn('git', ['checkout', '.'], {
        cwd: project.path,
        env: process.env,
      });
      gitPty.onExit(({ exitCode: gitExitCode }) => {
        if (gitExitCode === 0) {
          ws.send(JSON.stringify({ type: 'undo_done', message: 'Changes undone (git)!' }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Undo failed' }));
        }
      });
    }
  });
}

function execCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

async function getModifiedFiles(projectPath) {
  const files = new Set();

  try {
    const output = await execCommand('git', ['diff', '--name-only'], { cwd: projectPath });
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) files.add(trimmed);
    }
  } catch {
    // Ignore and fall back to other sources
  }

  try {
    const output = await execCommand('git', ['status', '--porcelain'], { cwd: projectPath });
    for (const line of output.split('\n')) {
      const entry = line.slice(3).trim();
      if (!entry) continue;
      const renamed = entry.includes('->') ? entry.split('->').pop().trim() : entry;
      if (renamed) files.add(renamed);
    }
  } catch {
    // Ignore and fall back to other sources
  }

  if (files.size === 0) {
    try {
      const output = await execCommand('jj', ['diff', '--name-only'], { cwd: projectPath });
      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) files.add(trimmed);
      }
    } catch {
      // No VCS detected
    }
  }

  return Array.from(files).sort();
}

async function sendModifiedFiles(ws, projectPath) {
  const files = await getModifiedFiles(projectPath);
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'modified_files', files }));
    }
  } catch {
    // Ignore send errors on closed sockets
  }
}

// Initialize managers
const weldrManager = new WeldrManager(config, console);
const devServerManager = new DevServerManager(config, console);
const healthManager = new HealthManager({
  config,
  weldrManager,
  devServerManager,
  wss,
  logger: console
});

const port = config.port || 3000;
server.listen(port, '0.0.0.0', async () => {
  console.log(`🚀 Code Chat running at http://localhost:${port}`);
  console.log(`   Projects: ${config.projects.map(p => p.name).join(', ') || 'none configured'}`);
  console.log(`\n   Configure projects in config.json`);
  
  // Start weldr daemons and dev servers for all projects
  await weldrManager.startAll();
  await devServerManager.startAll();
  healthManager.start();
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  devServerManager.stopAll();
  weldrManager.stopAll();
  healthManager.stop();
  
  // Close all WebSocket connections
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down');
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('Forcing exit...');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
