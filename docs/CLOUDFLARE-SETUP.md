# Cloudflare Tunnel Setup

Two options: quick test (no domain) or real domain.

---

## Option 1: Quick Test (No Domain Needed)

Perfect for iPhone testing right now.

### Step 1: Install cloudflared

```bash
brew install cloudflared
```

### Step 2: Start code-chat

```bash
cd ~/dev/code-chat
npm start
```

Should show: `🚀 Code Chat running at http://localhost:3000`

### Step 3: Create tunnel (new terminal)

```bash
cloudflared tunnel --url http://localhost:3000
```

You'll see something like:
```
Your quick Tunnel has been created! Visit it at:
https://random-words-1234.trycloudflare.com
```

### Step 4: Test!

- Open that URL on your iPhone
- Enter your access key: `otto-admin-2024`
- Select a project and start chatting!

**Note:** URL changes each time you restart the tunnel.

---

## Option 2: Real Domain (clodelab.com)

For permanent setup with your own domain.

### Step 1: Add Domain to Cloudflare

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click "Add a Site"
3. Enter `clodelab.com`
4. Select Free plan
5. Cloudflare shows you nameservers like:
   - `anna.ns.cloudflare.com`
   - `bob.ns.cloudflare.com`

### Step 2: Update Nameservers at Namecheap

1. Go to Namecheap → Domain List → clodelab.com → Manage
2. Under "Nameservers", select "Custom DNS"
3. Enter the Cloudflare nameservers
4. Save (takes 5-30 min to propagate)

### Step 3: Create a Cloudflare Tunnel (One-Time)

```bash
# Login to Cloudflare
cloudflared tunnel login
# Opens browser - select clodelab.com

# Create a named tunnel
cloudflared tunnel create codechat
# Note the tunnel ID (e.g., a1b2c3d4-...)

# Create config file
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: YOUR_TUNNEL_ID
credentials-file: /Users/vonwao/.cloudflared/YOUR_TUNNEL_ID.json

ingress:
  - hostname: clodelab.com
    service: http://localhost:3000
  - hostname: "*.clodelab.com"
    service: http://localhost:3000
  - service: http_status:404
EOF
```

Replace `YOUR_TUNNEL_ID` with the actual ID from step above.

### Step 4: Create DNS Record

```bash
cloudflared tunnel route dns codechat clodelab.com
```

This creates a CNAME record pointing to your tunnel.

### Step 5: Run the Tunnel

```bash
# Start code-chat
cd ~/dev/code-chat && npm start

# Start tunnel (new terminal)
cloudflared tunnel run codechat
```

### Step 6: Test!

- Open https://clodelab.com on any device
- Should show the code-chat login
- Enter access key and go!

---

## Run as Background Service (Optional)

### macOS (launchd)

```bash
# Install as service
sudo cloudflared service install

# Start it
sudo launchctl start com.cloudflare.cloudflared
```

Or manually:
```bash
# Run in background
cloudflared tunnel run codechat &
```

### Check Status

```bash
# See active tunnels
cloudflared tunnel list

# See tunnel info
cloudflared tunnel info codechat
```

---

## Troubleshooting

**"Bad gateway" error:**
- Make sure code-chat is running on localhost:3000

**Domain not working:**
- Check nameservers propagated: `dig clodelab.com NS`
- Should show cloudflare nameservers

**Certificate errors:**
- Cloudflare handles SSL automatically
- Wait a few minutes after first setup

**Tunnel disconnects:**
- Run as service for auto-reconnect
- Or use `--reconnect` flag

---

## Quick Reference

```bash
# Quick test (random URL)
cloudflared tunnel --url http://localhost:3000

# Named tunnel (clodelab.com)
cloudflared tunnel run codechat

# Check tunnels
cloudflared tunnel list

# Delete tunnel
cloudflared tunnel delete codechat
```
