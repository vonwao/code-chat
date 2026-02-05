# Stuck Session Detection

Code-chat includes monitoring to detect when Claude Code gets stuck.

## The Problem

Claude Code can get stuck in loops when:
1. Acceptance criteria are ambiguous
2. Tests fail intermittently  
3. A verification step can't succeed (e.g., server not running)
4. The todo system resets and repeats the same steps

**Symptoms:**
- Same todo items appearing repeatedly
- Same file operations cycling
- Session running for hours without completing

## How Detection Works

### 1. Timeout (default: 30 minutes)
If Claude runs longer than the configured timeout, the client receives a `timeout_warning` message with options to:
- **extend** - Add 15 more minutes
- **force_stop** - Kill Claude immediately
- **force_complete** - Accept current state as done

### 2. Loop Detection
The monitor tracks output patterns and detects repetition:
- Todo items (e.g., "Create scoring script")
- File operations (e.g., "Read server.js")
- Test results

When the same pattern appears 5+ times, a `loop_warning` is sent.

### 3. Progress Updates
Every 30 seconds, clients receive a `progress` message with:
```json
{
  "type": "progress",
  "elapsed": 120000,           // ms since start
  "sinceActivity": 5000,       // ms since last output
  "loopSuspicion": 35          // 0-100 score
}
```

## WebSocket Messages

### Incoming (client → server)

| Type | Description |
|------|-------------|
| `extend_timeout` | Add 15 minutes to current session |
| `force_stop` | Kill Claude immediately |
| `get_session_stats` | Request current session statistics |

### Outgoing (server → client)

| Type | Description |
|------|-------------|
| `progress` | Periodic progress update |
| `timeout_warning` | Session exceeded timeout |
| `loop_warning` | Repeated pattern detected |
| `timeout_extended` | Confirmation of extension |
| `force_stopped` | Confirmation of force stop |
| `session_stats` | Response to stats request |

## Configuration

In the server code (`src/server.js`):

```javascript
const claudeMonitor = new ClaudeMonitor({
  timeoutMs: 30 * 60 * 1000,      // 30 minute timeout
  loopThreshold: 5,               // Pattern repeat threshold
  stallMs: 5 * 60 * 1000,         // Stall detection (future)
  progressIntervalMs: 30 * 1000,  // Progress update interval
});
```

## UI Integration

The frontend should handle these messages by:

1. **On `progress`**: Update elapsed time display, show loop suspicion indicator
2. **On `timeout_warning`**: Show modal with options (Extend / Stop / Continue)
3. **On `loop_warning`**: Show warning banner with pattern info

Example handler:
```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  switch (msg.type) {
    case 'timeout_warning':
      showModal({
        title: 'Claude may be stuck',
        message: msg.message,
        buttons: [
          { label: 'Extend 15min', action: () => ws.send('{"type":"extend_timeout"}') },
          { label: 'Force Stop', action: () => ws.send('{"type":"force_stop"}') },
        ]
      });
      break;
      
    case 'loop_warning':
      showWarning(`Loop detected: ${msg.pattern} (${msg.count}x)`);
      break;
      
    case 'progress':
      updateElapsedTime(msg.elapsed);
      updateLoopIndicator(msg.loopSuspicion);
      break;
  }
};
```

## Best Practices for Task Specs

To reduce stuck sessions, write specs with clear exit conditions:

```markdown
## Acceptance Criteria

- [ ] Script runs without errors: `node script.js`
- [ ] API returns 200: `curl localhost:3000/api/test`
- [ ] Test passes: `npm test -- --grep "feature"`

## Exit Conditions

Task is COMPLETE when ALL of the above pass.
Task is BLOCKED if server won't start (report and exit).
```

Explicit exit conditions help Claude know when to stop.
