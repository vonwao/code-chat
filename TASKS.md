# Tasks — code-chat

AI-powered code editing for non-developers. Chat interface + live preview.

## 🏁 Milestone 1: Foundation ✅

### T1: Project scaffolding ✅ (done: 2026-02-04, 8d24841)
Initial code-chat implementation with WebSocket server, PTY management, and chat UI.

---
🎯 **Milestone 1 complete:** Basic chat + preview working

## 🏁 Milestone 2: Weldr Integration

### T2: Start weldr daemon with server @claude ✅ (done: 2026-02-04, 0ddfdd5)
**Depends:** T1
**Artifacts:** src/weldr.js, src/server.js (modified)
**Commit:** `feat: weldr daemon integration`

When code-chat server starts:
1. Check if weldr is installed (`which weldr`)
2. For each configured project, start `weldr daemon` in that directory
3. Track daemon processes, restart if they crash
4. Graceful shutdown on server exit

Should handle:
- weldr not installed (warn but continue)
- Project not initialized (run `weldr init` first, or auto-init)

### T3: Sync status indicator in UI @codex
**Depends:** T2
**Artifacts:** public/index.html (modified), src/server.js (modified)
**Commit:** `feat: sync status indicator`

Show weldr sync status in the UI:
1. Add endpoint `GET /api/projects/:id/sync-status`
2. Server runs `weldr status` and returns result
3. UI shows indicator: 🟢 Synced | 🟡 Syncing | 🔴 Disconnected
4. Poll every 5 seconds or use WebSocket

### T4: Show changed files after AI edit @codex
**Depends:** T1
**Artifacts:** public/index.html (modified), src/server.js (modified)
**Commit:** `feat: display changed files`

After Claude Code finishes:
1. Parse output to find changed files (or run `git diff --name-only`)
2. Send list to UI
3. Display in chat: "Modified: src/components/Button.tsx, src/styles.css"

---
🎯 **Milestone 2 complete:** Weldr integration working, users see sync status

## 🏁 Milestone 3: Production Ready

### T5: API key authentication @codex
**Depends:** T1
**Artifacts:** src/auth.js, src/server.js (modified), public/index.html (modified)
**Commit:** `feat: API key authentication`

Add simple auth:
1. Config: `auth.enabled`, `auth.keys` (array of valid keys)
2. Login page if auth enabled (just API key input)
3. Store key in localStorage
4. Send key in WebSocket connection URL or first message
5. Server validates and rejects invalid keys

### T6: Auto-start dev server @claude
**Depends:** T1
**Artifacts:** src/devserver.js, src/server.js (modified)
**Commit:** `feat: auto-start project dev servers`

When code-chat starts:
1. Read `devCommand` from project config
2. Start the dev server in a PTY
3. Track output, detect when ready (look for "ready" or port number)
4. Restart if it crashes
5. Kill on shutdown

Handle:
- Already running (port in use) — detect and skip
- Startup failure — show error in UI

### T7: Health check and restart @codex
**Depends:** T2, T6
**Artifacts:** src/health.js, src/server.js (modified)
**Commit:** `feat: health checks and auto-restart`

Periodic health checks:
1. Check weldr daemon is running
2. Check dev server is responding
3. Check WebSocket connections healthy
4. Auto-restart failed services
5. Log issues

### T8: Deployment documentation @claude
**Depends:** T5, T6
**Artifacts:** docs/DEPLOYMENT.md, README.md (modified)
**Commit:** `docs: deployment guide`

Document:
1. Mac mini setup with launchd
2. Tailscale configuration
3. Cloudflare Tunnel alternative
4. Config file examples
5. Troubleshooting

---
🎯 **Milestone 3 complete:** Production-ready for small team use

## Future Milestones (Not Yet Detailed)

## 🏁 Milestone 4: Enhanced UX
- Diff viewer for changes
- Undo history (multiple undos)
- File browser sidebar
- Syntax highlighting in chat

## 🏁 Milestone 5: Multi-User
- User identification
- "Alice is editing..." presence
- Activity log
- Notifications

---

## In Progress

## Done
- T1 ✅
