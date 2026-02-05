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

### T3: Sync status indicator in UI @codex ✅ (done: 2026-02-04, 6868fea)
**Depends:** T2
**Artifacts:** public/index.html (modified), src/server.js (modified)
**Commit:** `feat: sync status indicator`

Show weldr sync status in the UI:
1. Add endpoint `GET /api/projects/:id/sync-status`
2. Server runs `weldr status` and returns result
3. UI shows indicator: 🟢 Synced | 🟡 Syncing | 🔴 Disconnected
4. Poll every 5 seconds or use WebSocket

### T4: Show changed files after AI edit @codex ✅ (done: 2026-02-04, 3d739f2)
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

### T5: API key authentication @codex ✅ (done: 2026-02-04, 281a596)
**Depends:** T1
**Artifacts:** src/auth.js, src/server.js (modified), public/index.html (modified)
**Commit:** `feat: API key authentication`

Add simple auth:
1. Config: `auth.enabled`, `auth.keys` (array of valid keys)
2. Login page if auth enabled (just API key input)
3. Store key in localStorage
4. Send key in WebSocket connection URL or first message
5. Server validates and rejects invalid keys

### T6: Auto-start dev server @claude ✅ (done: 2026-02-04, 8c054b0)
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

### T7: Health check and restart @codex ✅ (done: 2026-02-04, d99ed6d)
**Depends:** T2, T6
**Artifacts:** src/health.js, src/server.js (modified)
**Commit:** `feat: health checks and auto-restart`

Periodic health checks:
1. Check weldr daemon is running
2. Check dev server is responding
3. Check WebSocket connections healthy
4. Auto-restart failed services
5. Log issues

### T8: Deployment documentation @claude ✅ (done: 2026-02-04, 9d470e0)
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

## 🏁 Milestone 4: Settings & Info Panel

### T9: Settings/Info panel UI @claude
**Depends:** T6, T7
**Artifacts:** public/index.html (modified), src/server.js (modified)
**Commit:** `feat: settings and info panel`

Add a collapsible settings/info panel (gear icon in header):

**Project Info Section:**
- List all configured projects
- For each project show:
  - Name and local path
  - Dev server status (🟢 Running / 🔴 Stopped / 🟡 Starting)
  - Dev server URL + port
  - Restart dev server button

**Weldr Integration Section:**
- For selected project show:
  - Weldr daemon status (🟢 Running / 🔴 Not running)
  - Sync status (connected/disconnected/local-only)
  - Sync server URL
  - Last sync timestamp
  - Pending changes count

**System Info Section:**
- code-chat version
- Node.js version
- weldr version (if installed)
- Uptime

Use existing APIs:
- `GET /api/projects/:id/sync-status`
- `GET /api/projects/:id/devserver-status`
- `POST /api/projects/:id/devserver-restart`

### T10: API endpoint for system info @codex
**Depends:** T9
**Artifacts:** src/server.js (modified)
**Commit:** `feat: system info API`

Add `GET /api/system-info` returning:
```json
{
  "version": "0.1.0",
  "nodeVersion": "22.0.0",
  "weldrVersion": "0.1.0",
  "uptime": 3600,
  "projects": [
    {
      "id": "neudelta",
      "name": "NeuDelta",
      "path": "/path/to/project",
      "devServer": { "status": "running", "url": "http://localhost:5000" },
      "weldr": { "daemonRunning": true, "syncStatus": "connected", "lastSync": "..." }
    }
  ]
}
```

### T11: Fix dev server preview connection @codex
**Depends:** T6
**Artifacts:** src/devserver.js (modified), public/index.html (modified)
**Commit:** `fix: dev server preview reliability`

Improve dev server reliability:
1. Better startup detection (wait for actual HTTP response)
2. Show loading state in preview while server starts
3. Retry preview load after dev server becomes ready
4. Show helpful error message if dev server fails to start
5. Add manual refresh button for preview

---
🎯 **Milestone 4 complete:** Users can see system status and troubleshoot issues

## 🏁 Milestone 5: Bug Fixes & Polish

### T12: Add postinstall script for node-pty rebuild @claude
**Priority:** High
**Artifacts:** package.json (modified), README.md (modified)
**Commit:** `fix: add postinstall script for node-pty`

Problem: node-pty native module fails with "posix_spawnp failed" on fresh installs or after Node upgrades.

Solution: Add to package.json:
```json
"scripts": {
  "postinstall": "npm rebuild node-pty --build-from-source"
}
```

Also update README with troubleshooting section.

### T13: Make weldr sync truly optional @claude
**Priority:** Medium
**Artifacts:** src/weldr.js (modified), src/server.js (modified)
**Commit:** `fix: make weldr sync optional, reduce log spam`

Current: Even with no sync server, weldr manager logs reconnection errors constantly.

Fix:
1. If `weldr.syncUrl` is empty/missing in config, skip all sync logic
2. If sync URL is configured but server unreachable, reduce retry frequency (exponential backoff)
3. Add clear log message: "Weldr sync disabled (no server configured)"

### T14: Delay health checks during startup @codex
**Priority:** Low
**Artifacts:** src/health.js (modified)
**Commit:** `fix: delay health checks during startup`

Don't run health checks on servers that are in "starting" state.
Wait at least 30 seconds after startup before first health check.

### T15: Investigate iframe preview issues @claude
**Priority:** High
**Artifacts:** docs/ISSUES.md (updated), possibly src/server.js
**Commit:** `docs: document preview iframe requirements`

Some projects don't render in the preview iframe. Investigate:
1. X-Frame-Options headers from dev servers
2. Content-Security-Policy restrictions
3. Mixed content (HTTPS tunnel → HTTP localhost)

Document which frameworks work and which don't.
Consider adding a proxy endpoint that strips restrictive headers.

---

## 🏁 Milestone 6: Enhanced UX

### T16: File browser sidebar @claude
Show project file tree in collapsible sidebar.
Let users click to view file contents (read-only).
Helps non-technical users understand project structure.

### T17: Diff viewer for changes @codex
After AI makes changes, show a diff view.
Side-by-side or inline format.
Help users understand what changed.

### T18: Undo history (multiple levels) @claude
Stack of undo states, not just last change.
Show timeline of changes.
Let user click to roll back to any point.
Use git under the hood.

### T19: Preview auto-refresh @codex
Watch for file changes in project.
Auto-reload iframe when files change.
Debounce to avoid constant reloads during AI edits.

---

## 🏁 Milestone 7: Multi-User

### T20: User presence indicators
Show "Alice is viewing..." in UI.
Track which users are connected to which projects.

### T21: Activity log
Show recent activity: "Alice changed header.tsx 5 min ago"
Useful for async collaboration.

---

## In Progress

## Done
- T1 ✅ T2 ✅ T3 ✅ T4 ✅ T5 ✅ T6 ✅ T7 ✅ T8 ✅
