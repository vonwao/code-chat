# Code-Chat Architecture: Tradeoffs & Design Decisions

*A candid discussion of the architectural choices in code-chat, including when to use weldr sync and when not to.*

## The Core Question

When building an AI-powered code editor for teams, you face a fundamental architecture choice:

**Centralized (Replit model):**
- One copy of the code on a server
- Multiple users connect via browser
- Everyone edits the same files

**Distributed (Git model):**
- Each user has their own copy
- Changes sync between copies
- Merge conflicts resolved somehow

code-chat started centralized (simpler), but supports distributed mode via weldr when you need it.

---

## When Does Concurrent Editing Matter?

**It usually doesn't.** Most teams using AI coding tools fall into these patterns:

| Pattern | Conflict Risk | Solution |
|---------|--------------|----------|
| Solo founder | None | Just use code-chat |
| CEO + CTO taking turns | Low | Activity indicator is enough |
| Two devs, different features | Low | Different files, no conflict |
| Refactoring (touches many files) | High | This is where weldr helps |
| Two AIs editing same file | High | weldr + jj handles this |

**The honest truth:** For 80% of use cases, a single shared copy with "last edited by X" indicator is fine. The Replit model works.

---

## The Problem With Shared Copy

When two users ARE editing simultaneously:

```
Alice (code-chat): "Add authentication to the API"
Bob (code-chat): "Refactor the API to use async/await"

Both AIs decide to edit api.ts.
Last write wins. Someone's work is lost.
```

This is rare but painful when it happens.

---

## Enter weldr + jj

**jj (Jujutsu)** is a Git-compatible VCS with killer features:

1. **Working-copy-as-commit** — Every file save is automatically versioned
2. **Auto-rebase** — When two people edit, jj rebases one on top of the other
3. **Non-blocking conflicts** — Conflicts don't stop you from working
4. **Line-level tracking** — Non-overlapping edits to the same file merge cleanly

**weldr** is a daemon that:
- Watches your files
- Auto-commits changes to jj
- Syncs with a server
- Pushes/pulls changes to/from other machines

Together, they enable true concurrent editing across machines.

---

## The Architecture Options

### Option A: Single Copy (Default)

```
User A (browser) ──┐
                   ├──► code-chat server ──► ONE copy on disk
User B (browser) ──┘
```

**Pros:** Simple, no setup, works out of the box  
**Cons:** Race conditions if editing same file simultaneously

**Best for:** Solo users, teams that take turns, demos

### Option B: Single Copy + Activity Awareness

Same as A, but with:
- "Alice is editing..." indicator
- "Last change 30s ago by Bob" badges
- Optional file-level soft locks

**Pros:** Still simple, but users know when to wait  
**Cons:** Still has race condition, just warns about it

**Best for:** Small teams (2-3) who mostly take turns

### Option C: Distributed + weldr

```
code-chat (browser) ──► server copy ──► weldr daemon ──┐
                                                        ├──► weldr server
VS Code (CTO laptop) ──► local copy ──► weldr daemon ──┘
```

**Pros:** True concurrent editing, automatic merging  
**Cons:** More setup, requires weldr on each machine

**Best for:** CEO + CTO setup, remote team members, heavy concurrent editing

### Option D: Per-User Workspaces (Future)

```
code-chat server
├── project/.jj/ (shared history)
├── project/@alice/ (Alice's workspace)
├── project/@bob/ (Bob's workspace)
└── weldr daemon (watches all, syncs via jj)
```

**Pros:** Multiple code-chat users can edit truly concurrently  
**Cons:** Complex, needs per-user preview servers, not built yet

**Best for:** Teams where multiple people use code-chat simultaneously

---

## The Commit Frequency Problem

Traditional weldr: commit on every file save (with 5s debounce).

**Problem with AI edits:**

```
Claude editing auth.ts:
  - save 1: add import
  - save 2: add function signature  
  - save 3: add function body
  - save 4: fix typo

With debounce: 2-3 commits for ONE logical change
```

This creates noisy history and more merge conflicts.

**Better approach: Commit on task completion**

```
User: "Add authentication middleware"
Claude: *edits 4 files, 12 saves*
Claude: "Done!"
→ ONE commit: "Add authentication middleware"
```

**Implementation:**
- Disable debounce during AI editing
- Watch for Claude returning control
- Commit with the user's prompt as message

This gives you:
- Clean history (one commit per task)
- Better merge behavior (logical units, not fragments)
- Meaningful commit messages (the actual request)

---

## Recommended Setup by Team Type

### Solo Founder
```
code-chat only, no weldr
Git for version control
Push to GitHub when ready
```

### CEO (non-technical) + CTO (technical)
```
code-chat for CEO (browser)
VS Code + weldr for CTO (their machine)
weldr server syncs between them
Both push to GitHub
```

### Small Dev Team (2-4)
```
Each dev: VS Code + weldr on their machine
code-chat available for quick fixes/non-devs
weldr server syncs everyone
CI/CD from main branch
```

### Team with AI Agents
```
Each AI agent = another weldr client
Commits on task completion
Human review in dashboard
jj handles merges automatically
```

---

## What weldr Does NOT Solve

1. **Two users in same code-chat session, same file** — Still a race. Need Option D (per-user workspaces) for this.

2. **Semantic conflicts** — jj handles textual conflicts. It won't catch "Alice deleted the function Bob is calling."

3. **Large-scale refactoring** — If Alice renames a file that Bob is editing, conflicts will happen. Communication still matters.

4. **Code review** — weldr is "trust your team" mode. No PRs. If you need approval gates, use traditional Git workflow.

---

## The Philosophy

weldr + code-chat is built for **small, high-trust teams** where:

- Everyone can commit to main
- AI is a first-class team member
- Speed matters more than ceremony
- You'd rather fix a conflict than wait for a PR review

If you need approval workflows, audit trails, or don't trust your team — stick with GitHub PRs. That's fine. Different tools for different contexts.

---

## Further Reading

- [MULTI-USER-GUIDE.md](./MULTI-USER-GUIDE.md) — How to set up CEO + CTO workflow
- [WELDR-INTEGRATION.md](./WELDR-INTEGRATION.md) — Technical details on weldr config
- [weldr-v3 docs](https://github.com/vonwao/weldr-v3) — Full weldr documentation
- [jj documentation](https://martinvonz.github.io/jj/) — Jujutsu VCS
