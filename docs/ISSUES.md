# Known Issues & Challenges

Last updated: 2026-02-05

## 🔴 Critical Issues

### P1: node-pty rebuild required on fresh installs
**Status:** Workaround exists
**Symptom:** `posix_spawnp failed` error when starting dev servers
**Cause:** node-pty native module not properly built for current Node version/architecture
**Workaround:** Run `npm rebuild node-pty --build-from-source`
**Proper fix needed:** 
- Add postinstall script to package.json
- Or document in README
- Or use a more reliable PTY library

### P2: Preview iframe CORS/security issues
**Status:** Needs investigation  
**Symptom:** Some dev servers don't render in iframe
**Possible causes:**
- X-Frame-Options header blocking embedding
- Content-Security-Policy restrictions
- Mixed content (HTTPS tunnel → HTTP localhost)
**Needs:**
- Test with different frameworks (Next.js, Vite, plain HTML)
- Consider proxy approach to inject proper headers
- Document which frameworks work out of the box

## 🟡 Medium Priority

### M1: Weldr sync constantly reconnecting
**Status:** Expected behavior (no server running)
**Symptom:** Log spam with `⚠ WebSocket error` and `reconnecting`
**Cause:** Config has `syncUrl: ws://localhost:9999` but no weldr server running
**Fix options:**
- Make weldr sync truly optional (don't attempt if no server configured)
- Reduce reconnect frequency when server unreachable
- Add "weldr disabled" mode that skips all sync logic

### M2: Health check warnings during startup
**Status:** Minor annoyance
**Symptom:** `[health] Dev server not responding for X (1/2)` during normal startup
**Cause:** Health check runs before server has time to start
**Fix:** Delay first health check, or skip health checks for servers in "starting" state

### M3: No graceful handling of Claude Code unavailability
**Status:** Needs implementation
**Symptom:** If `claude` CLI not installed, unclear error
**Fix:** Check for claude on startup, show clear message in UI if missing

## 🟢 Low Priority / Nice to Have

### L1: No file browser
**Status:** Feature not implemented
**Impact:** Users can only interact via chat, can't browse project files
**Consider:** Simple tree view in sidebar

### L2: No undo history beyond last change
**Status:** Feature not implemented  
**Impact:** Can only undo the most recent AI edit
**Consider:** Stack of undo states, or integration with git history

### L3: No diff view for changes
**Status:** Feature not implemented
**Impact:** Users see "files changed" but not what changed
**Consider:** Side-by-side or inline diff viewer

### L4: Preview doesn't auto-refresh
**Status:** Feature not implemented
**Impact:** Users must manually refresh preview after AI makes changes
**Consider:** Watch for file changes, auto-reload iframe

---

## Environment-Specific Notes

### macOS (Apple Silicon)
- node-pty requires Xcode command line tools
- May need `npm rebuild` after Node version changes
- Works with Node 22.x

### Linux
- Not tested yet
- Should work but may need different PTY setup

### Windows
- Not supported (node-pty has Windows support but not tested)
- Recommend WSL2
