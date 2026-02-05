# Multi-User Setup Guide: CEO + CTO Workflow

*How to set up code-chat so a non-technical CEO can edit code via browser while a CTO works in VS Code — with changes syncing automatically.*

## The Setup

```
┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐
│   Server (your Mac/cloud)           │     │   CTO's Laptop                      │
│                                     │     │                                     │
│   ┌─────────────┐                   │     │   ┌─────────────┐                   │
│   │ code-chat   │ ◄── CEO browser   │     │   │  VS Code    │                   │
│   │ (port 3333) │                   │     │   └──────┬──────┘                   │
│   └──────┬──────┘                   │     │          │                          │
│          │                          │     │          ▼                          │
│          ▼                          │     │   ┌─────────────┐                   │
│   ┌─────────────┐                   │     │   │ project/    │                   │
│   │ project/    │                   │     │   │ (CTO copy)  │                   │
│   │ (server)    │                   │     │   └──────┬──────┘                   │
│   └──────┬──────┘                   │     │          │                          │
│          │                          │     │          ▼                          │
│          ▼                          │     │   ┌─────────────┐                   │
│   ┌─────────────┐                   │     │   │ weldr       │                   │
│   │ weldr       │                   │     │   │ daemon      │                   │
│   │ daemon      │                   │     │   └──────┬──────┘                   │
│   └──────┬──────┘                   │     │          │                          │
│          │                          │     └──────────┼──────────────────────────┘
│          │                          │                │
│          ▼                          │                │
│   ┌─────────────┐                   │                │
│   │ weldr       │ ◄─────────────────┼────────────────┘
│   │ server      │   WebSocket sync  │
│   │ (port 9999) │                   │
│   └─────────────┘                   │
│                                     │
└─────────────────────────────────────┘

CEO edits via browser → weldr syncs → CTO sees changes in VS Code
CTO edits in VS Code → weldr syncs → CEO sees changes in code-chat
```

---

## Prerequisites

**On the server (Mac mini, cloud VM, etc.):**
- Node.js 18+
- code-chat installed and configured
- weldr-v3 installed
- cloudflared (for remote access)

**On the CTO's laptop:**
- Node.js 18+
- weldr-v3 installed (`npm install -g weldr` or clone repo)
- Git (weldr uses Git storage)
- jj (Jujutsu) — `brew install jj` on Mac

---

## Step 1: Start the weldr Server

On your server, start the sync server:

```bash
# From weldr-v3 directory
weldr server --port 9999 --auth-keys "your-team-token"

# Output:
#   Database: /path/to/weldr-server.db
#   Auth keys: 1
#   Mock sync server listening on ws://0.0.0.0:9999
```

**For remote access**, tunnel the weldr server:

```bash
# Quick tunnel (random URL, good for testing)
cloudflared tunnel --url http://localhost:9999

# Output: https://random-words.trycloudflare.com
```

Save this URL — the CTO will need it.

---

## Step 2: Configure code-chat

Edit `config.json` to enable weldr sync:

```json
{
  "port": 3333,
  "auth": {
    "enabled": true,
    "keys": {
      "ceo-key": { "name": "CEO", "projects": ["myproject"] },
      "cto-key": { "name": "CTO", "projects": "*" }
    }
  },
  "weldr": {
    "enabled": true,
    "syncUrl": "ws://localhost:9999",
    "syncToken": "your-team-token"
  },
  "projects": [
    {
      "id": "myproject",
      "name": "My Startup",
      "path": "/path/to/project",
      "previewPort": 3001,
      "devCommand": "npm run dev"
    }
  ]
}
```

---

## Step 3: Initialize weldr in the Project

On the server, initialize weldr in your project:

```bash
cd /path/to/project

# Initialize jj + weldr
weldr init

# Start the daemon (code-chat does this automatically, but you can run manually)
weldr daemon --sync-url ws://localhost:9999 --sync-token your-team-token
```

---

## Step 4: CTO Setup (Remote Machine)

On the CTO's laptop:

```bash
# Clone the project (if not already)
git clone https://github.com/yourcompany/myproject
cd myproject

# Initialize weldr
weldr init

# Connect to the sync server (use the tunnel URL for remote)
weldr daemon --sync-url wss://random-words.trycloudflare.com --sync-token your-team-token

# Output:
#   ✓ Watching for changes in /path/to/myproject
#   [sync] connected to wss://random-words.trycloudflare.com
```

**Note:** Use `wss://` (secure WebSocket) for the Cloudflare tunnel, not `ws://`.

Now the CTO can open the project in VS Code and edit normally. Changes sync automatically.

---

## Step 5: Start code-chat

On the server:

```bash
cd /path/to/code-chat
npm start

# Output:
#   🚀 Code Chat running at http://localhost:3333
#   [weldr] Connected to sync server
```

Tunnel code-chat for CEO access:

```bash
cloudflared tunnel --url http://localhost:3333

# Output: https://other-random-words.trycloudflare.com
```

Give this URL to the CEO along with their API key.

---

## How It Works

### CEO Makes a Change

1. CEO opens code-chat in browser
2. CEO: "Change the button color to blue"
3. Claude Code edits `styles.css`
4. weldr daemon detects file change
5. weldr commits: "Change the button color to blue"
6. weldr syncs to server
7. CTO's weldr daemon receives change
8. CTO's `styles.css` updates automatically
9. CTO sees the change in VS Code

### CTO Makes a Change

1. CTO edits `api.ts` in VS Code
2. CTO saves the file
3. weldr daemon detects change (5s debounce)
4. weldr commits the change
5. weldr syncs to server
6. Server copy updates
7. CEO's next code-chat view shows the change

### Both Edit Different Files

1. CEO edits `styles.css`
2. CTO edits `api.ts` (same time)
3. Both weldr daemons commit
4. Both sync to server
5. jj rebases one on top of the other
6. Both machines get both changes
7. No conflict (different files)

### Both Edit Same File (Non-overlapping)

1. CEO edits `app.ts` lines 1-20
2. CTO edits `app.ts` lines 50-70
3. Both commit and sync
4. jj sees non-overlapping changes
5. Clean merge — both changes preserved

### Both Edit Same File (Overlapping)

1. CEO edits `app.ts` lines 10-15
2. CTO edits `app.ts` lines 12-18
3. Both commit and sync
4. jj detects conflict
5. Conflict markers appear in both copies
6. Someone resolves manually
7. Resolution syncs to everyone

---

## Conflict Resolution

When jj detects a conflict, the file will contain markers:

```javascript
function handleAuth() {
<<<<<<< 
  // CEO's version
  return authenticate(user);
%%%%%%%
  // CTO's version  
  return await authenticateAsync(user);
>>>>>>>
}
```

To resolve:
1. Edit the file to pick the right version (or combine)
2. Remove the conflict markers
3. Save the file
4. weldr commits the resolution
5. Resolution syncs to everyone

**Tip:** The CTO should handle conflict resolution (they're more technical).

---

## Commit Messages

**CTO (VS Code) commits:** Default weldr behavior — auto-generated messages based on changed files.

**CEO (code-chat) commits:** Should use the user's prompt as the commit message.

```
# Good: "Add user authentication" 
# Bad: "Modified 3 files"
```

Configure code-chat to commit on AI task completion, not file save (see [ARCHITECTURE.md](./ARCHITECTURE.md)).

---

## Production Setup

For stable URLs (not random Cloudflare tunnels):

### Option 1: Named Cloudflare Tunnel

```bash
# One-time setup
cloudflared tunnel create code-chat
cloudflared tunnel route dns code-chat chat.yourdomain.com
cloudflared tunnel route dns code-chat-sync sync.yourdomain.com

# Run tunnels
cloudflared tunnel run --url http://localhost:3333 code-chat
cloudflared tunnel run --url http://localhost:9999 code-chat-sync
```

### Option 2: Tailscale (Private Network)

```bash
# Install Tailscale on server and CTO laptop
# Both join same tailnet
# Access via Tailscale IP: http://100.x.x.x:3333
```

### Option 3: Direct Port Forward

If you control the network:
```bash
# Forward ports 3333 and 9999 to the server
# Use your public IP or domain
```

---

## Troubleshooting

### weldr daemon won't connect

```bash
# Check if server is running
curl http://localhost:9999
# Should return something (even an error page)

# Check token matches
# Server: --auth-keys "token123"
# Client: --sync-token "token123"
```

### Changes not syncing

```bash
# Check weldr status
weldr status

# Look for:
#   Sync: connected
#   Last sync: <recent timestamp>
```

### Conflicts not resolving

```bash
# Check jj status
jj status

# If stuck, can restore to known state
jj undo
```

### CTO can't connect to tunnel

- Use `wss://` not `ws://` for Cloudflare tunnels
- Check tunnel is still running on server
- Quick tunnels expire — restart cloudflared if needed

---

## Security Notes

1. **API keys** — Use different keys for CEO vs CTO for audit trail
2. **weldr token** — Shared between all team members, keep it secret
3. **Tunnel access** — Anyone with the URL can attempt to connect
4. **Code access** — weldr syncs everything, no per-file permissions

For sensitive projects, use Tailscale (private network) instead of public tunnels.

---

## Next Steps

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Deep dive on tradeoffs
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Full production deployment guide
- [weldr docs](https://github.com/vonwao/weldr-v3) — weldr reference
