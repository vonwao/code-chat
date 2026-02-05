# weldr Integration Technical Reference

*How code-chat integrates with weldr for file sync and version control.*

## Overview

code-chat can optionally use weldr to:
1. Auto-commit changes made by Claude Code
2. Sync changes with remote team members
3. Handle concurrent edits via jj's auto-merge

Without weldr, code-chat uses plain files (last write wins).

---

## Configuration

### Enabling weldr in config.json

```json
{
  "weldr": {
    "enabled": true,
    "syncUrl": "ws://localhost:9999",
    "syncToken": "your-team-token",
    "commitOnTaskComplete": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Enable weldr integration |
| `syncUrl` | string | WebSocket URL of weldr server |
| `syncToken` | string | Authentication token |
| `commitOnTaskComplete` | boolean | Commit when AI finishes (vs on every save) |

### Per-Project Override

```json
{
  "projects": [
    {
      "id": "demo",
      "name": "Demo",
      "path": "/path/to/demo",
      "weldr": {
        "enabled": false
      }
    }
  ]
}
```

---

## How It Works

### Startup Sequence

```
1. code-chat starts
2. For each project with weldr enabled:
   a. Check if .weldr/ exists, if not run `weldr init`
   b. Spawn `weldr daemon --sync-url <url> --sync-token <token>`
   c. Wait for daemon to connect
3. Server ready
```

### On AI Edit

```
1. User sends prompt
2. Claude Code edits files
3. Files saved to disk
4. If commitOnTaskComplete:
   - Wait for Claude to finish
   - Run `jj commit -m "<user prompt>"`
5. Else (debounce mode):
   - weldr daemon auto-commits after 5s quiet
6. weldr syncs commit to server
7. Other clients receive changes
```

### On Remote Change

```
1. weldr daemon receives sync_push from server
2. jj applies changes to working copy
3. If conflict:
   - Conflict markers written to file
   - Notification sent to code-chat
4. File system watcher sees change
5. Preview reloads (if running)
```

---

## API Endpoints

### GET /api/weldr/status

Returns weldr status for all projects.

```json
{
  "projects": {
    "demo": {
      "enabled": true,
      "connected": true,
      "lastSync": "2024-02-04T23:45:00Z",
      "pendingChanges": 0,
      "conflicts": []
    }
  }
}
```

### POST /api/weldr/commit

Manually trigger a commit.

```json
{
  "projectId": "demo",
  "message": "Manual checkpoint"
}
```

### GET /api/weldr/history

Get recent commit history.

```json
{
  "projectId": "demo",
  "limit": 10
}
```

Response:
```json
{
  "commits": [
    {
      "id": "abc123",
      "message": "Add authentication",
      "author": "CEO",
      "timestamp": "2024-02-04T23:30:00Z",
      "files": ["auth.ts", "api.ts"]
    }
  ]
}
```

---

## weldr Daemon Management

code-chat manages weldr daemons as child processes.

### Process Lifecycle

```javascript
// Spawn daemon
const daemon = spawn('weldr', [
  'daemon',
  '--sync-url', config.weldr.syncUrl,
  '--sync-token', config.weldr.syncToken
], {
  cwd: project.path,
  stdio: ['pipe', 'pipe', 'pipe']
});

// Monitor stdout for status
daemon.stdout.on('data', (data) => {
  if (data.includes('[sync] connected')) {
    project.weldrConnected = true;
  }
});

// Restart on crash
daemon.on('exit', (code) => {
  if (code !== 0) {
    setTimeout(() => startDaemon(project), 1000);
  }
});
```

### Health Checks

code-chat periodically checks daemon health:

```javascript
// Every 30 seconds
setInterval(() => {
  for (const project of projects) {
    if (project.weldr.enabled && !project.weldrConnected) {
      restartDaemon(project);
    }
  }
}, 30000);
```

---

## Commit on Task Complete

When `commitOnTaskComplete` is enabled, code-chat tracks Claude's editing state:

```javascript
// In chat handler
async function handleChat(prompt, projectId) {
  // Mark editing started
  project.isEditing = true;
  
  // Run Claude Code
  const result = await claudeCode.run(prompt, project.path);
  
  // Mark editing complete
  project.isEditing = false;
  
  // Commit with prompt as message
  if (project.weldr.enabled && project.weldr.commitOnTaskComplete) {
    await exec('jj', ['commit', '-m', prompt], { cwd: project.path });
  }
  
  return result;
}
```

This ensures:
- One commit per user request
- Meaningful commit messages
- No partial commits during multi-file edits

---

## Conflict Handling

When jj detects a conflict:

1. **weldr daemon** logs the conflict
2. **code-chat** detects conflict via file watcher or daemon output
3. **UI** shows conflict notification
4. **User** resolves in code-chat or defers to CTO

### Conflict Detection

```javascript
// Watch daemon output
daemon.stderr.on('data', (data) => {
  if (data.includes('conflict')) {
    const files = parseConflictFiles(data);
    notifyConflict(project.id, files);
  }
});

// Or check jj status periodically
async function checkConflicts(project) {
  const { stdout } = await exec('jj', ['status'], { cwd: project.path });
  if (stdout.includes('conflict')) {
    return parseConflicts(stdout);
  }
  return [];
}
```

### Conflict UI (Future)

```
┌─────────────────────────────────────────┐
│ ⚠️ Conflict in auth.ts                  │
│                                         │
│ Your change: "Add login validation"     │
│ Their change: "Refactor auth flow"      │
│                                         │
│ [View Diff] [Accept Mine] [Accept Theirs] [Edit]
└─────────────────────────────────────────┘
```

---

## jj Commands Reference

code-chat uses these jj commands internally:

| Command | Purpose |
|---------|---------|
| `jj init --git-repo` | Initialize jj with Git backend |
| `jj status` | Check for conflicts, modified files |
| `jj commit -m "msg"` | Create a commit |
| `jj log -n 10` | Recent history |
| `jj undo` | Revert last operation |
| `jj diff` | Show uncommitted changes |
| `jj resolve` | Mark conflict as resolved |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WELDR_SYNC_URL` | - | Override sync URL |
| `WELDR_SYNC_TOKEN` | - | Override sync token |
| `WELDR_DEBUG` | false | Enable debug logging |
| `JJ_CONFIG` | - | Path to jj config |

---

## Troubleshooting

### Daemon won't start

```bash
# Check if jj is installed
jj --version

# Check if project is initialized
ls -la /path/to/project/.jj

# Initialize if needed
cd /path/to/project && weldr init
```

### Sync disconnects frequently

```bash
# Check server is running
curl http://localhost:9999

# Check for network issues
ping your-sync-server.com

# Restart daemon
pkill -f "weldr daemon"
# code-chat will auto-restart it
```

### Commits not appearing

```bash
# Check weldr status
weldr status

# Check jj log
cd /path/to/project && jj log

# Force sync
weldr sync --force
```

### Conflict markers stuck in files

```bash
# Check jj status
jj status

# Edit file to resolve conflict
# Then mark as resolved
jj resolve /path/to/file.ts

# Or undo and retry
jj undo
```

---

## Future Improvements

1. **Per-user workspaces** — Multiple code-chat users get isolated jj workspaces
2. **Conflict resolution UI** — Visual diff and merge in browser
3. **Selective sync** — Choose which projects/branches to sync
4. **Git push integration** — Auto-push to GitHub after sync
5. **Commit attribution** — Track which user/AI made each commit
