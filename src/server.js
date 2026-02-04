import express from 'express';
import { WebSocketServer } from 'ws';
import { spawn } from 'node-pty';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { WeldrManager } from './weldr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
const configPath = process.env.CONFIG_PATH || join(__dirname, '../config.json');
let config = { projects: [], port: 3000 };
if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(join(__dirname, '../public')));

// API: List projects
app.get('/api/projects', (req, res) => {
  res.json(config.projects.map(p => ({
    id: p.id,
    name: p.name,
    previewUrl: p.previewUrl,
  })));
});

// Track active PTY sessions
const sessions = new Map();

wss.on('connection', (ws) => {
  let currentPty = null;
  let currentProjectId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'select_project':
        handleSelectProject(ws, msg.projectId);
        currentProjectId = msg.projectId;
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

function handleSelectProject(ws, projectId) {
  const project = config.projects.find(p => p.id === projectId);
  if (!project) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown project: ${projectId}` }));
    return;
  }
  
  ws.send(JSON.stringify({
    type: 'project_selected',
    project: {
      id: project.id,
      name: project.name,
      previewUrl: project.previewUrl,
    }
  }));
}

function handleChat(ws, projectId, prompt, setPty) {
  const project = config.projects.find(p => p.id === projectId);
  if (!project) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown project: ${projectId}` }));
    return;
  }

  ws.send(JSON.stringify({ type: 'thinking' }));

  // Spawn Claude Code with the prompt
  // Using -p for print mode (non-interactive) and --dangerously-skip-permissions
  const pty = spawn('claude', [
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
  });
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

// Initialize weldr manager
const weldrManager = new WeldrManager(config, console);

const port = config.port || 3000;
server.listen(port, '0.0.0.0', async () => {
  console.log(`🚀 Code Chat running at http://localhost:${port}`);
  console.log(`   Projects: ${config.projects.map(p => p.name).join(', ') || 'none configured'}`);
  console.log(`\n   Configure projects in config.json`);
  
  // Start weldr daemons for all projects
  await weldrManager.startAll();
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  weldrManager.stopAll();
  
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
