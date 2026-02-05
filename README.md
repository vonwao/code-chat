# Code Chat

> AI-powered code editing for non-developers. Ask for changes in plain English, see them live.

## What is this?

A web interface that lets anyone edit code by chatting with AI. No IDE needed.

**Perfect for:**
- CEOs who want to tweak the landing page
- Designers who want to adjust CSS
- Product managers who want to fix typos
- Anyone who shouldn't need to learn git

## Features

- 🗣️ **Natural language editing** — "Add a login button to the header"
- 👀 **Live preview** — See changes instantly
- 🔐 **Access control** — Per-user keys with project permissions
- ↩️ **Undo** — One-click revert
- 📁 **Multi-project** — Manage multiple codebases
- 🌐 **Remote access** — Share via Cloudflare Tunnel

## Quick Start

```bash
# Clone and install
git clone https://github.com/vonwao/code-chat.git
cd code-chat
npm install

# Configure
cp config.example.json config.json
# Edit config.json (see below)

# Start
npm start

# Open http://localhost:3000
```

## Configuration

### Basic Setup

```json
{
  "port": 3000,
  "projects": [
    {
      "id": "my-app",
      "name": "My App",
      "path": "/path/to/your/project",
      "previewUrl": "http://localhost:5173",
      "devCommand": "npm run dev"
    }
  ]
}
```

### With Authentication (Recommended)

```json
{
  "port": 3000,
  "auth": {
    "enabled": true,
    "keys": {
      "friend-key-123": {
        "name": "Friend",
        "projects": ["demo"]
      },
      "ceo-key-456": {
        "name": "CEO",
        "projects": ["company-site"]
      },
      "admin-key-789": {
        "name": "Admin",
        "projects": "*"
      }
    }
  },
  "projects": [
    {
      "id": "demo",
      "name": "Demo Project",
      "path": "/path/to/demo",
      "previewUrl": "http://localhost:3001",
      "devCommand": "npm run dev"
    },
    {
      "id": "company-site",
      "name": "Company Website",
      "path": "/path/to/company-site",
      "previewUrl": "http://localhost:5173",
      "devCommand": "npm run dev"
    }
  ]
}
```

### Config Reference

| Field | Description |
|-------|-------------|
| `port` | Server port (default: 3000) |
| `auth.enabled` | Enable access keys |
| `auth.keys` | Object mapping keys to user info |
| `auth.keys.*.name` | Display name shown in UI |
| `auth.keys.*.projects` | Array of project IDs, or `"*"` for all |
| `projects[].id` | Unique identifier (no spaces) |
| `projects[].name` | Display name in dropdown |
| `projects[].path` | Absolute path to project |
| `projects[].previewUrl` | URL where dev server runs |
| `projects[].devCommand` | Command to start dev server (optional) |

## Requirements

- **Node.js 18+**
- **Claude CLI** installed and authenticated:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude auth
  ```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │     Chat Panel      │  │      Live Preview           │   │
│  │                     │  │                             │   │
│  │  "Make the button   │  │      Your App               │   │
│  │   bigger and blue"  │  │      (auto-refreshes)       │   │
│  │                     │  │                             │   │
│  │  AI: "Done! I       │  │                             │   │
│  │   changed..."       │  │                             │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
└───────────────┬─────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────┐
│  Code Chat Server         │
│  - Runs Claude Code       │
│  - Edits your files       │
│  - Dev server auto-starts │
└───────────────────────────┘
```

1. User types a request in plain English
2. Server runs Claude Code in the project directory
3. Claude edits the files
4. Dev server hot-reloads
5. Preview updates automatically

## Remote Access

### Option 1: Quick Test (No Domain)

```bash
# Install cloudflared
brew install cloudflared

# Start code-chat
npm start

# Create temporary tunnel (new terminal)
cloudflared tunnel --url http://localhost:3000
# Gives you: https://random-words.trycloudflare.com
```

Share that URL — works on phones, any browser.

### Option 2: Your Own Domain

See **[docs/CLOUDFLARE-SETUP.md](docs/CLOUDFLARE-SETUP.md)** for full instructions.

Quick version:
```bash
# One-time setup
cloudflared tunnel login
cloudflared tunnel create codechat
cloudflared tunnel route dns codechat yourdomain.com

# Create ~/.cloudflared/config.yml (see docs)

# Run
cloudflared tunnel run codechat
```

### Option 3: Tailscale (Private Network)

```bash
# Install on your machine
brew install tailscale
tailscale up

# Share the Tailscale IP with teammates
tailscale ip -4  # e.g., 100.64.0.1

# They access: http://100.64.0.1:3000
```

Requires Tailscale app on each device.

## Deployment

For running as a persistent service, see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**:
- macOS launchd setup
- Auto-restart on crash
- Log management

## Weldr Integration (Optional)

[Weldr](https://github.com/vonwao/weldr-v3) provides real-time sync between multiple editors. If installed:

```json
{
  "weldr": {
    "syncUrl": "ws://localhost:9876",
    "syncToken": "your-token"
  }
}
```

Code Chat will:
- Start weldr daemon for each project
- Show sync status in UI
- Auto-commit changes

## Tips

### Be Specific
- ✅ "Make the Submit button blue (#3B82F6)"
- ❌ "Change the button"

### Reference Files
- ✅ "In src/components/Header.tsx, add a login link"
- ❌ "Add a login link somewhere"

### One Thing at a Time
Multiple changes = multiple messages for best results.

### Example Prompts
- "Change the heading to 'Welcome to Acme'"
- "Make the primary button color #3B82F6"
- "Add padding of 20px to the cards"
- "Fix the typo 'recieve' → 'receive'"
- "Add a Contact link to the navigation"

## Troubleshooting

### "Claude not found"
```bash
npm install -g @anthropic-ai/claude-code
claude auth
```

### Preview shows "Connection Refused"
Your project's dev server isn't running. Code Chat tries to auto-start it if `devCommand` is configured. Check the terminal for errors.

### Changes not appearing
1. Hard refresh (Cmd+Shift+R)
2. Check dev server hasn't crashed
3. Check browser console for errors

### Auth not working
Make sure `config.json` has:
```json
{
  "auth": {
    "enabled": true,
    "keys": { ... }
  }
}
```

## Contributing

PRs welcome! See [TASKS.md](TASKS.md) for planned features.

## License

MIT
