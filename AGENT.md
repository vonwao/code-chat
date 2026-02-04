# Agent Context — code-chat

## Project Overview
code-chat is a web-based AI coding interface for non-developers. Users chat with an AI (Claude Code) to make code changes, and see results in a live preview.

## Tech Stack
- **Runtime:** Node.js 18+
- **Server:** Express + WebSocket (ws)
- **PTY:** node-pty for running Claude Code
- **Frontend:** Vanilla HTML/CSS/JS (single file, no build step)

## Architecture
```
Browser (chat UI) 
    ↓ WebSocket
Server (Express + WS)
    ↓ PTY spawn
Claude Code (edits project)
    ↓
Project files → Dev server → Preview iframe
```

## Key Files
- `src/server.js` — Main server, WebSocket handling, PTY management
- `public/index.html` — Chat UI (self-contained)
- `config.json` — Project configuration (gitignored)

## Commands
```bash
npm start     # Start server
npm run dev   # Start with --watch
```

## Conventions
- ESM modules (`"type": "module"` in package.json)
- No TypeScript (keep it simple for now)
- Config in `config.json`, example in `config.example.json`

## Integration Points
- **Weldr:** Run `weldr daemon` for auto-commit/sync
- **Claude Code:** Spawned via PTY with `-p` flag (print mode)
- **Preview:** iframe to project's dev server URL

## Testing
Manual testing for now. Run server, open browser, try editing.

## Related Projects
- weldr-v3 (`~/dev/weldr-v3`) — Sync server and daemon
- neudelta-ceo (`~/dev/code-chat-projects/neudelta-ceo`) — Test project

## Weldr Integration
weldr is globally linked and available as `weldr` command.

Key commands:
- `weldr init` — Initialize project with jj
- `weldr daemon --sync-url <url> --sync-token <token>` — Start file watcher + sync
- `weldr status` — Show jj/sync status
- `weldr server --port <port> --auth-keys <keys>` — Run sync server

Sync URL format: `ws://host:port` with separate `--sync-token` flag.

For code-chat integration:
1. Start weldr daemon for each project when server starts
2. Pass sync URL/token from project config
3. Track daemon processes for restart on crash
4. Show sync status in UI
