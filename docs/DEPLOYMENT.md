# Deployment Guide

This guide covers deploying Code Chat on a Mac mini for team access.

## Overview

Code Chat runs as a persistent service on a Mac mini, accessible to team members via:
- **Tailscale** (recommended) — Private mesh VPN, simple setup
- **Cloudflare Tunnel** — Public URL with access controls

## Prerequisites

- Mac mini with macOS 12+
- Node.js 18+ installed
- Claude CLI installed and authenticated (`claude auth`)
- Admin access for launchd configuration

## Mac mini Setup with launchd

launchd keeps Code Chat running automatically, even after restarts.

### 1. Create the Launch Agent

Create the plist file:

```bash
sudo nano /Library/LaunchDaemons/com.code-chat.server.plist
```

Paste this configuration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.org/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.code-chat.server</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/admin/code-chat/src/server.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/admin/code-chat</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/admin</string>
        <key>CONFIG_PATH</key>
        <string>/Users/admin/code-chat/config.json</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>/var/log/code-chat/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>/var/log/code-chat/stderr.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

### 2. Adjust Paths

Update these paths to match your setup:
- `/usr/local/bin/node` — Path to Node.js (`which node`)
- `/Users/admin/code-chat` — Path to code-chat installation
- `/Users/admin` — Home directory of the user

### 3. Create Log Directory

```bash
sudo mkdir -p /var/log/code-chat
sudo chown $(whoami) /var/log/code-chat
```

### 4. Load the Service

```bash
# Set correct permissions
sudo chown root:wheel /Library/LaunchDaemons/com.code-chat.server.plist
sudo chmod 644 /Library/LaunchDaemons/com.code-chat.server.plist

# Load and start
sudo launchctl load /Library/LaunchDaemons/com.code-chat.server.plist
```

### 5. Manage the Service

```bash
# Check status
sudo launchctl list | grep code-chat

# View logs
tail -f /var/log/code-chat/stdout.log

# Stop service
sudo launchctl unload /Library/LaunchDaemons/com.code-chat.server.plist

# Restart service
sudo launchctl unload /Library/LaunchDaemons/com.code-chat.server.plist
sudo launchctl load /Library/LaunchDaemons/com.code-chat.server.plist
```

### Alternative: User Launch Agent

For user-level service (doesn't require sudo, runs only when user is logged in):

```bash
# Create user agent
mkdir -p ~/Library/LaunchAgents
cp /Library/LaunchDaemons/com.code-chat.server.plist ~/Library/LaunchAgents/

# Adjust permissions
chmod 644 ~/Library/LaunchAgents/com.code-chat.server.plist

# Load
launchctl load ~/Library/LaunchAgents/com.code-chat.server.plist
```

## Remote Access Options

### Option 1: Tailscale (Recommended)

Tailscale creates a private mesh VPN. Team members connect directly to the Mac mini over an encrypted connection.

**Pros:**
- Simple setup, no port forwarding
- End-to-end encryption
- Works behind NAT/firewalls
- Free for personal use (up to 100 devices)

**Setup on Mac mini:**

```bash
# Install
brew install tailscale

# Start and authenticate
tailscale up

# Get your Tailscale IP
tailscale ip -4
# Output: 100.x.x.x
```

**Team member setup:**

1. Install Tailscale on their device
2. Join your Tailscale network (use Tailscale admin console to invite)
3. Access Code Chat at `http://100.x.x.x:3000`

**Optional: Magic DNS**

Enable Magic DNS in Tailscale admin console for friendly names:
```
http://mac-mini:3000
```

**Security tip:** Enable API key authentication in `config.json`:

```json
{
  "auth": {
    "enabled": true,
    "keys": ["team-secret-key-here"]
  }
}
```

### Option 2: Cloudflare Tunnel

Cloudflare Tunnel exposes your local server via a public URL with Cloudflare's security features.

**Pros:**
- Public URL (no VPN needed)
- Cloudflare Access for authentication
- DDoS protection
- Works behind NAT/firewalls

**Cons:**
- Requires a domain on Cloudflare
- More complex setup

**Setup:**

```bash
# Install cloudflared
brew install cloudflared

# Authenticate with Cloudflare
cloudflared tunnel login

# Create a tunnel
cloudflared tunnel create code-chat

# Configure DNS (replace with your domain)
cloudflared tunnel route dns code-chat chat.yourdomain.com
```

**Create tunnel config:**

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: code-chat
credentials-file: /Users/admin/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: chat.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**Run the tunnel:**

```bash
# Test manually
cloudflared tunnel run code-chat

# Or install as service
sudo cloudflared service install
sudo launchctl start com.cloudflare.cloudflared
```

**Add Cloudflare Access (recommended):**

1. Go to Cloudflare Zero Trust dashboard
2. Access → Applications → Add an application
3. Select "Self-hosted"
4. Configure your domain and authentication policy

## Configuration Examples

### Basic Setup (Local Only)

```json
{
  "port": 3000,
  "projects": [
    {
      "id": "my-app",
      "name": "My App",
      "path": "/Users/admin/projects/my-app",
      "previewUrl": "http://localhost:5173",
      "devCommand": "npm run dev"
    }
  ]
}
```

### Team Setup with Authentication

```json
{
  "port": 3000,
  "auth": {
    "enabled": true,
    "keys": [
      "alice-key-abc123",
      "bob-key-xyz789"
    ]
  },
  "projects": [
    {
      "id": "company-site",
      "name": "Company Website",
      "path": "/Users/admin/projects/company-site",
      "previewUrl": "http://localhost:3000",
      "devCommand": "npm run dev"
    },
    {
      "id": "dashboard",
      "name": "Admin Dashboard",
      "path": "/Users/admin/projects/dashboard",
      "previewUrl": "http://localhost:3001",
      "devCommand": "npm run dev -- --port 3001"
    }
  ]
}
```

### With Weldr Sync

```json
{
  "port": 3000,
  "auth": {
    "enabled": true,
    "keys": ["team-key"]
  },
  "weldr": {
    "syncUrl": "ws://sync.example.com:9999",
    "syncToken": "weldr-auth-token"
  },
  "projects": [
    {
      "id": "my-app",
      "name": "My App",
      "path": "/Users/admin/projects/my-app",
      "previewUrl": "http://localhost:5173",
      "devCommand": "npm run dev"
    }
  ]
}
```

## Troubleshooting

### Service won't start

**Check launchd status:**
```bash
sudo launchctl list | grep code-chat
# If PID is "-" and status is non-zero, there's an error
```

**View detailed error:**
```bash
sudo launchctl error <status-code>
```

**Common issues:**
- Wrong path to Node.js — verify with `which node`
- Missing dependencies — run `npm install` in code-chat directory
- Port already in use — change port in config.json

### Claude CLI not found

The service runs in a minimal environment. Ensure Claude CLI is in a standard path:

```bash
# Find where claude is installed
which claude

# Add to PATH in plist if needed
<key>PATH</key>
<string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
```

Or install globally:
```bash
sudo npm install -g @anthropic-ai/claude-cli
```

### Preview not loading through Tailscale

The preview iframe needs to reach the dev server. Options:

1. **Run dev server on 0.0.0.0:**
   ```json
   "devCommand": "npm run dev -- --host 0.0.0.0"
   ```

2. **Use Tailscale IP in previewUrl:**
   ```json
   "previewUrl": "http://100.x.x.x:5173"
   ```

### WebSocket connection drops

Check if the client is behind a proxy that times out idle connections. The health manager sends pings every 20 seconds to keep connections alive.

If using Cloudflare Tunnel, ensure WebSocket support is enabled (it is by default).

### Permission denied errors

Ensure the launchd service runs as the correct user with access to:
- The code-chat directory
- Project directories
- Claude CLI credentials (`~/.claude/`)

### High memory usage

Each project's dev server runs in a separate process. Monitor with:
```bash
ps aux | grep -E "(node|vite|next)"
```

Consider limiting concurrent projects or using external dev servers.

### Logs filling up disk

Add log rotation:

```bash
# Create /etc/newsyslog.d/code-chat.conf
sudo nano /etc/newsyslog.d/code-chat.conf
```

```
/var/log/code-chat/stdout.log  644  5  1000  *  J
/var/log/code-chat/stderr.log  644  5  1000  *  J
```

## Health Checks

Code Chat includes automatic health monitoring:

- **Dev server checks** — HTTP health checks every 15 seconds
- **Auto-restart** — Failed dev servers restart automatically (after 2 consecutive failures)
- **WebSocket heartbeat** — Ping/pong to detect stale connections
- **Weldr daemon monitoring** — Restarts crashed daemons

View health status in logs:
```bash
tail -f /var/log/code-chat/stdout.log | grep health
```

## Security Checklist

- [ ] Enable API key authentication in config.json
- [ ] Use unique keys per team member for audit trails
- [ ] Use Tailscale or Cloudflare Access for network security
- [ ] Don't expose port 3000 directly to the internet
- [ ] Keep Node.js and dependencies updated
- [ ] Review project paths — only include intended directories
- [ ] Consider running as non-admin user
