# Ideas & Brainstorms

This is a living doc of ideas for code-chat. Not commitments — just possibilities.

---

## 🎯 Core Vision Questions

### Who is this for?
**Current answer:** Non-technical founders who want to make small changes to their codebase without bothering their CTO.

**Open questions:**
- Is "CEO edits code" actually a real use case, or are we solving a problem nobody has?
- Should we also target technical people who want faster iteration?
- What about designers who want to tweak UI?

### What's the relationship with Weldr?
**Current:** Weldr sync is optional but integrated. CEO + CTO can work on different machines and sync via weldr server.

**Tension:** Most code-chat users probably don't need weldr. It adds complexity.

**Options:**
1. Keep weldr integration but make it truly optional (don't even mention if not configured)
2. Remove weldr from code-chat, keep it as separate tool
3. Lean into the "CEO + CTO collaboration" story more

---

## 💡 Feature Ideas

### Progressive Ownership (from mosaic-builder)
Let users mark files/regions as PROTECTED, MANAGED, or EXTENDED.
- **PROTECTED:** AI can read but never write
- **MANAGED:** AI controls completely  
- **EXTENDED:** AI-managed with @custom blocks preserved

**Why:** Prevents AI from clobbering important business logic.
**See:** docs/PROGRESSIVE-OWNERSHIP.md for full design

### Voice Input
Let users speak their requests instead of typing.
- Use Web Speech API or Whisper
- Good for mobile/tablet use
- "Change the button color to blue" is easier to say than type

### Image Input
Let users paste/upload screenshots.
- "Make it look like this"
- Use vision model to understand intent
- Particularly useful for design tweaks

### Multiple Projects Side-by-Side
Current: one project at a time.
Idea: split view with two projects, or tabs.
Use case: Compare before/after, or work on related repos.

### Commit Messages
Currently: AI makes changes but doesn't commit.
Idea: Auto-commit after each successful change with AI-generated message.
Concern: Too many commits? Let user control.

### Rollback UI
Show recent changes as a timeline.
Let user click to roll back to any point.
Use git under the hood.

### "Explain This" Mode
User selects a file or function.
AI explains what it does, in plain English.
Good for non-technical users understanding their codebase.

### Shareable Sessions
Generate a link to share the chat history.
Useful for: "Hey CTO, look what I tried to do"
Privacy concern: need to be careful about code exposure.

### Templates / Starter Prompts
Pre-written prompts for common tasks:
- "Add a new page at /about"
- "Create a contact form"  
- "Add dark mode toggle"
- "Fix mobile layout"

### Cost Tracking
Show how many tokens/dollars each request cost.
Let users set budget limits.
Important for teams worried about API costs.

---

## 🏗️ Architecture Ideas

### Replace node-pty with something simpler
node-pty is powerful but finicky (rebuild issues, platform differences).
Alternative: just use child_process with stdout/stderr capture?
Tradeoff: lose true TTY support, but might be fine for our use case.

### WebContainer for Preview
Instead of running local dev servers, use WebContainers (like StackBlitz).
Pros: No local process management, works in browser
Cons: Limited to certain frameworks, performance

### Plugin System
Let users extend code-chat with custom tools:
- Database viewers
- API testers  
- Log viewers
- Custom AI prompts

### Multi-Model Support
Currently: Claude Code only.
Idea: Support other coding models (GPT-4, Codex, local models).
Challenge: Different models have different interfaces.

---

## 🤔 Open Questions

1. **How do we handle merge conflicts?** If CEO and CTO both edit the same file, weldr will try to auto-merge. What if it fails?

2. **What about secrets?** If .env files are in the project, AI might accidentally expose them. Need guardrails.

3. **Rate limiting?** If someone spams the chat, they could run up a huge API bill. Need some protection.

4. **Mobile experience?** Current UI is desktop-focused. How important is mobile?

5. **Offline mode?** Could code-chat work without internet (using local models)?

---

## 📝 Notes from User Testing

*(Add notes here as we test with real users)*

- 2026-02-04: First test with cloudflare tunnel. Preview loading issues.
- 2026-02-05: node-pty rebuild issue discovered. Previews working after fix.

---

## 🗑️ Rejected Ideas

### Browser-based Monaco editor
Tried this with weldr-v2. Too complex, fighting the browser.
Decision: Let users use their preferred editor, code-chat is just the chat interface.

### Full IDE replacement
code-chat is not trying to replace VS Code.
It's a focused tool for non-developers to make small changes.
