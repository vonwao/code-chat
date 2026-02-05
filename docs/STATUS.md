# Project Status

Last updated: 2026-02-05

## Current State

**code-chat is functional but rough around the edges.**

### What Works ✅
- WebSocket server with PTY for Claude Code
- Chat UI with project selector
- Per-user API key authentication with project permissions
- Live preview iframe (when dev servers are running)
- Dev server auto-start and management
- Weldr daemon integration (optional)
- Health checks with auto-restart
- Cloudflare Tunnel for remote access
- Changed files display after AI edits
- Undo/cancel functionality

### What's Broken/Missing ❌
- node-pty requires manual rebuild (see ISSUES.md)
- Preview sometimes doesn't load (iframe/CORS issues)
- Weldr sync spams logs if server not running
- No file browser
- No diff view for changes
- No undo history (only last change)
- No mobile optimization

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (UI)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Chat Panel │  │  Preview    │  │  Project Selector   │  │
│  │  (WebSocket)│  │  (iframe)   │  │  + Auth             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Node.js Server                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  WebSocket  │  │  DevServer  │  │  Weldr Manager      │  │
│  │  Handler    │  │  Manager    │  │  (optional)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Claude Code │  │ npm run dev │  │  weldr daemon       │  │
│  │ (PTY)       │  │ (PTY)       │  │  (subprocess)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Project Files                           │
│  ~/dev/code-chat-projects/neudelta-ceo/                     │
│  ~/dev/code-chat-projects/demo/                             │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
code-chat/
├── src/
│   ├── server.js      # Main entry, Express + WebSocket
│   ├── auth.js        # API key authentication
│   ├── devserver.js   # Dev server PTY management
│   ├── health.js      # Health checks and auto-restart
│   └── weldr.js       # Weldr daemon management
├── public/
│   └── index.html     # Single-page UI (vanilla JS)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CLOUDFLARE-SETUP.md
│   ├── DEPLOYMENT.md
│   ├── IDEAS.md
│   ├── ISSUES.md
│   ├── MULTI-USER-GUIDE.md
│   ├── PROGRESSIVE-OWNERSHIP.md
│   ├── STATUS.md (this file)
│   └── WELDR-INTEGRATION.md
├── config.json        # Runtime config (gitignored)
├── config.example.json
├── TASKS.md           # Task tracking for AI agents
├── AGENT.md           # Instructions for AI agents
└── README.md
```

## Configuration

See `config.example.json`:

```json
{
  "port": 3333,
  "auth": {
    "enabled": true,
    "keys": {
      "key-name": {
        "name": "User Name",
        "projects": ["project-id"] // or "*" for all
      }
    }
  },
  "weldr": {
    "syncUrl": "ws://localhost:9999",  // optional
    "syncToken": "your-token"
  },
  "projects": [
    {
      "id": "my-project",
      "name": "My Project",
      "path": "/absolute/path/to/project",
      "previewUrl": "http://localhost:3000",
      "devCommand": "npm run dev"
    }
  ]
}
```

## Test Credentials

| Key | User | Access |
|-----|------|--------|
| `otto-admin-2024` | Admin | All projects |
| `ceo-neudelta-2024` | CEO | neudelta only |
| `tester-demo-2024` | Tester | demo only |

## How to Run Locally

```bash
cd ~/dev/code-chat

# First time / after Node upgrade:
npm install
npm rebuild node-pty --build-from-source

# Start server:
node src/server.js

# Access at http://localhost:3333
```

## How to Expose Remotely

```bash
# Quick tunnel (temporary URL):
cloudflared tunnel --url http://localhost:3333

# For permanent setup, see docs/CLOUDFLARE-SETUP.md
```

## Dependencies

- **Node.js 22+**
- **Claude CLI** (`claude` command must be available)
- **node-pty** (native module, may need rebuild)
- **weldr** (optional, for sync features)

## Related Projects

- **weldr-v3** (`~/dev/weldr-v3`) — The sync server and daemon
- **weldr-site** (`~/dev/weldr-site`) — Marketing site
- **code-chat-projects/** — Project sandboxes for testing
