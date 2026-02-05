# Code Chat

> AI-powered code editing for non-developers. Ask for changes in plain English, see them live.

![Demo](demo.gif)

## What is this?

A simple web interface that lets non-technical people edit code by chatting with AI. Think "ChatGPT but it actually edits your codebase."

**Perfect for:**
- CEOs who want to tweak the landing page
- Designers who want to adjust CSS
- Product managers who want to fix typos
- Anyone who shouldn't need to open an IDE

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/yourusername/code-chat.git
cd code-chat
npm install

# 2. Configure projects
cp config.example.json config.json
# Edit config.json with your projects

# 3. Start your project's dev server (in another terminal)
cd /path/to/your/project
npm run dev  # or: vite, next dev, etc.

# 4. Start Code Chat
npm start

# 5. Open http://localhost:3000
```

## Configuration

Create `config.json`:

```json
{
  "port": 3000,
  "projects": [
    {
      "id": "my-app",
      "name": "My Startup App",
      "path": "/Users/me/code/my-app",
      "previewUrl": "http://localhost:5173"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (no spaces) |
| `name` | Display name in the dropdown |
| `path` | Absolute path to project directory |
| `previewUrl` | URL where the dev server runs |

## Requirements

- **Node.js 18+**
- **Claude CLI** (`claude`) installed and authenticated
  - Install: `npm install -g @anthropic-ai/claude-cli`
  - Auth: `claude auth`
- **Your project's dev server running** (Vite, Next.js, etc.)

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │     Chat Panel      │  │      Live Preview           │   │
│  │                     │  │                             │   │
│  │  "Make the button   │  │   ┌─────────────────────┐  │   │
│  │   bigger and blue"  │  │   │                     │  │   │
│  │                     │  │   │   Your App          │  │   │
│  │  AI: "Done! I       │  │   │   (auto-refreshes)  │  │   │
│  │   changed..."       │  │   │                     │  │   │
│  └─────────────────────┘  │   └─────────────────────┘  │   │
└───────────────┬───────────┴─────────────┬───────────────────┘
                │                         │
                ▼                         │
┌───────────────────────────┐             │
│  Code Chat Server         │             │
│  - Runs Claude CLI        │─────────────┘
│  - Edits your codebase    │      (iframe to dev server)
└───────────────────────────┘
```

1. You type a request in the chat
2. Server runs Claude Code in your project directory
3. Claude edits the files
4. Your dev server hot-reloads
5. Preview updates automatically

## Features

- **🗣️ Natural language editing** — "Add a login button to the header"
- **👀 Live preview** — See changes instantly
- **↩️ Undo** — One-click undo last change
- **⏹️ Cancel** — Stop AI mid-task
- **📁 Multi-project** — Switch between projects
- **🔄 Streaming** — See AI's progress in real-time

## Remote Access (Team Setup)

For remote team members to access Code Chat on your Mac mini:

### Option 1: Tailscale (Recommended)

```bash
# On Mac mini
brew install tailscale
tailscale up
# Note the IP: tailscale ip -4

# Teammates install Tailscale, join your network
# Then access: http://100.x.x.x:3000
```

### Option 2: Cloudflare Tunnel

```bash
# On Mac mini
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create code-chat
cloudflared tunnel route dns code-chat chat.yourdomain.com

# Run tunnel
cloudflared tunnel run --url http://localhost:3000 code-chat

# Teammates access: https://chat.yourdomain.com
```

For detailed deployment instructions including launchd setup, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tips

### For the best experience:

1. **Be specific** — "Make the Submit button blue" > "Change the button"
2. **Reference files** — "In the header component, add..." 
3. **One thing at a time** — Multiple changes = multiple messages
4. **Use Undo liberally** — It's cheap, mistakes happen

### Example prompts:

- "Change the heading on the homepage to 'Welcome to Acme'"
- "Make the primary button color #3B82F6"
- "Add a 'Contact Us' link to the navigation"
- "Fix the typo 'recieve' → 'receive' on the pricing page"
- "Add padding to the cards on the features section"

## Troubleshooting

### "Claude not found"

Install Claude CLI:
```bash
npm install -g @anthropic-ai/claude-cli
claude auth
```

### Preview not loading

Make sure your project's dev server is running:
```bash
cd /path/to/project
npm run dev
```

### Changes not appearing

1. Check the dev server hasn't crashed
2. Try a hard refresh (Cmd+Shift+R)
3. Check the console for errors

## License

MIT
