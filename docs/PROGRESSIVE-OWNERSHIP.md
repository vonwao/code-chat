# Progressive Ownership in code-chat

*How to let AI edit most of your code while protecting what matters.*

## The Problem

AI coding tools have a fundamental tension:

**Let AI do everything:**
- Fast iteration
- But... AI might break your custom logic
- "Why did it delete my authentication check?!"

**Never let AI touch your code:**
- Safe
- But... you're back to manual coding
- What's the point of the AI?

**Progressive ownership** is the middle ground.

---

## The Solution: Ownership Modes

Every file (or section of a file) has an ownership mode:

| Mode | AI Can | Best For |
|------|--------|----------|
| **MANAGED** | Read, write, delete | Boilerplate, generated code, UI components |
| **EXTENDED** | Read, write around @custom blocks | Files with mix of generated + custom logic |
| **PROTECTED** | Read only | Business logic, billing, auth, secrets |

### Examples

```
📁 my-project/
├── 🟢 components/Button.tsx      [MANAGED] — AI can change freely
├── 🟢 components/Card.tsx        [MANAGED]
├── 🟡 lib/api.ts                 [EXTENDED] — has @custom blocks
├── 🔴 lib/billing.ts             [PROTECTED] — AI can't modify
├── 🔴 lib/auth.ts                [PROTECTED]
└── 🔴 .env.local                 [PROTECTED] — never touch secrets
```

---

## Implementation in code-chat

### 1. The Ownership Manifest

A simple YAML file at the project root:

```yaml
# weldr.ownership.yaml

# Default: AI can edit everything
default: MANAGED

# Protected files — AI can read but never write
protected:
  - lib/billing/**
  - lib/auth/**
  - lib/secrets/**
  - "*.env*"
  - ".env*"

# Extended files — AI must preserve @custom blocks
extended:
  - lib/api.ts
  - app/api/**/*.ts

# Patterns to always ignore (never even read)
ignore:
  - node_modules/**
  - .git/**
  - "*.lock"
```

### 2. How code-chat Enforces It

**Before AI edits:**
```
1. User: "Add rate limiting to the API"
2. code-chat reads weldr.ownership.yaml
3. code-chat tells Claude: 
   "You may NOT modify these files: lib/billing/*, lib/auth/*
    You MUST preserve @custom blocks in: lib/api.ts
    Everything else is fair game."
4. Claude makes changes, respecting constraints
5. code-chat validates no protected files were touched
6. If violation: reject changes, explain why
```

**System prompt injection:**
```
## Ownership Rules (MUST FOLLOW)

PROTECTED FILES (read-only, never modify):
- lib/billing/**
- lib/auth/**

EXTENDED FILES (preserve @custom blocks):
- lib/api.ts
- app/api/**/*.ts

If a task requires modifying a protected file, STOP and ask the user.
Do not attempt to work around protections.
```

### 3. @custom Blocks

In EXTENDED files, users can mark regions that must survive:

```typescript
// lib/api.ts

import { rateLimit } from './middleware';

// AI can modify this part
export async function fetchUsers() {
  return db.users.findMany();
}

// @custom:begin user-validation
// AI must preserve this block exactly
function validateUserAccess(user: User, resource: Resource): boolean {
  // Complex business logic that AI shouldn't touch
  if (user.role === 'admin') return true;
  if (resource.ownerId === user.id) return true;
  if (user.permissions.includes(resource.type)) return true;
  return false;
}
// @custom:end

// AI can modify this part too
export async function updateUser(id: string, data: UpdateUserInput) {
  const user = await db.users.findUnique({ where: { id } });
  if (!validateUserAccess(currentUser, user)) {
    throw new Error('Unauthorized');
  }
  return db.users.update({ where: { id }, data });
}
```

**How Claude sees it:**
```
This file has a @custom block from lines 10-19.
You may edit lines 1-9 and 20+.
You must preserve lines 10-19 EXACTLY as they are.
```

### 4. Violation Handling

When AI tries to violate ownership:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Ownership Violation Blocked                              │
│                                                             │
│ Claude tried to modify: lib/billing/stripe.ts               │
│ But this file is PROTECTED                                  │
│                                                             │
│ Options:                                                    │
│ [Allow Once] [Add to Managed] [Edit Manually] [Cancel]      │
└─────────────────────────────────────────────────────────────┘
```

Options:
- **Allow Once**: Let this edit through, keep file protected
- **Add to Managed**: Change file to MANAGED mode permanently
- **Edit Manually**: Open the file for human editing
- **Cancel**: Reject the whole change

---

## User Experience

### Setting Up Ownership

**Option A: Quick Setup Dialog**

When first using code-chat on a project:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔐 Set Up AI Permissions                                    │
│                                                             │
│ Which files should AI NEVER modify?                         │
│                                                             │
│ Common patterns:                                            │
│ [x] Auth files (lib/auth/*, auth.*)                        │
│ [x] Billing/payments (billing/*, stripe.*, payments.*)     │
│ [x] Environment files (.env*)                               │
│ [ ] Database migrations                                     │
│ [ ] API routes                                              │
│                                                             │
│ Custom patterns: [________________________]                 │
│                                                             │
│ [Save & Continue]                                           │
└─────────────────────────────────────────────────────────────┘
```

**Option B: In-Chat Commands**

```
You: /protect lib/billing/**
code-chat: ✓ Added lib/billing/** to protected files

You: /extend lib/api.ts  
code-chat: ✓ lib/api.ts is now EXTENDED. Add @custom blocks to protect specific sections.

You: /ownership
code-chat: 
  Protected: lib/billing/**, lib/auth/**, .env*
  Extended: lib/api.ts
  Managed: everything else
```

**Option C: File Explorer Badges**

In the code-chat UI, show ownership status:

```
📁 lib/
  🔴 auth.ts          [Protected]
  🔴 billing.ts       [Protected]
  🟡 api.ts           [Extended]
  🟢 utils.ts         [Managed]
```

Right-click to change ownership mode.

### Visibility During Edits

When Claude is working, show what's protected:

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 Claude is editing...                                     │
│                                                             │
│ Files being modified:                                       │
│   🟢 components/UserCard.tsx                               │
│   🟢 lib/utils.ts                                          │
│   🟡 lib/api.ts (preserving 2 @custom blocks)              │
│                                                             │
│ Protected (not touched):                                    │
│   🔴 lib/auth.ts                                           │
│   🔴 lib/billing.ts                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Cases

### 1. AI Needs to Modify Protected File

```
User: "Add Stripe webhook handling"

Claude: I need to modify lib/billing/webhooks.ts, but it's protected.
        
        Options:
        1. You can add it to managed files and I'll edit it
        2. I can show you the changes and you can apply them manually
        3. I can create a new file lib/billing/new-webhooks.ts (managed)
        
        What would you prefer?
```

### 2. @custom Block Conflicts

If AI changes make a @custom block invalid:

```
⚠️ Custom Block Warning

The code around @custom:user-validation has changed.
Your custom block still works, but you may want to review:

- Function signature changed: validateUserAccess(user) → validateUserAccess(user, resource)
- New import added: import { Resource } from './types'

[Review Changes] [Keep As-Is] [Merge Manually]
```

### 3. New Files

New files created by AI are MANAGED by default. User can protect them after:

```
Claude created 3 new files:
  🟢 lib/rateLimiter.ts    [Managed]
  🟢 lib/middleware.ts     [Managed]
  🟢 types/api.ts          [Managed]

[Protect All] [Protect Selected] [Keep Managed]
```

### 4. Inherited Patterns

If a protected file is imported by a managed file:

```
// lib/api.ts (MANAGED)
import { validateUser } from './auth';  // auth.ts is PROTECTED

// AI can modify api.ts, but must keep the import
// AI cannot modify what validateUser does
```

---

## Config File Reference

Full `weldr.ownership.yaml` spec:

```yaml
# Version of the ownership schema
version: "1.0"

# Default mode for files not matching any pattern
# Options: MANAGED | PROTECTED
default: MANAGED

# Files AI cannot modify (can still read for context)
protected:
  # Glob patterns
  - "lib/auth/**"
  - "lib/billing/**"
  - "**/*.secret.*"
  
  # Exact files
  - "lib/core/permissions.ts"
  
  # Environment files
  - ".env*"
  - "*.env"

# Files with @custom blocks that must be preserved
extended:
  - "lib/api/**/*.ts"
  - "app/api/**/*.ts"
  
# Files AI should never even read (beyond .gitignore)
ignore:
  - "**/*.key"
  - "**/*.pem"
  - ".secrets/**"

# Optional: named protection groups
groups:
  billing:
    mode: PROTECTED
    files:
      - "lib/billing/**"
      - "lib/stripe/**"
    reason: "Payment logic - requires human review"
    
  auth:
    mode: PROTECTED  
    files:
      - "lib/auth/**"
      - "middleware/auth.ts"
    reason: "Security-critical code"

# Optional: per-user overrides (for teams)
users:
  cto@company.com:
    # CTO can override protections
    can_override: true
  intern@company.com:
    # Intern has extra restrictions
    additional_protected:
      - "lib/database/**"
```

---

## Implementation Phases

### Phase 1: Basic Protection (MVP)
- [ ] `weldr.ownership.yaml` parsing
- [ ] Protected files enforced (AI can't modify)
- [ ] System prompt injection
- [ ] Violation blocking with dialog
- [ ] /protect and /ownership commands

### Phase 2: @custom Blocks
- [ ] Block detection in extended files
- [ ] Block preservation during edits
- [ ] Conflict detection
- [ ] Block validation (syntax still valid?)

### Phase 3: UI Integration
- [ ] File explorer badges
- [ ] Quick setup dialog
- [ ] Right-click ownership changes
- [ ] Edit-time visibility

### Phase 4: Team Features
- [ ] Per-user overrides
- [ ] Ownership change audit log
- [ ] "Request to modify protected" workflow

---

## Why This Matters

**For the CEO using code-chat:**
"I can ask AI to change anything, and it won't break our billing system."

**For the CTO reviewing changes:**
"I know my auth logic is safe. I only need to review what actually changed."

**For the startup:**
"We move fast with AI, but our critical business logic is protected."

---

## Related Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — Overall system design
- [MULTI-USER-GUIDE.md](./MULTI-USER-GUIDE.md) — CEO + CTO setup
- [Weldr Ideas](https://vonwao.github.io/weldr-site/ideas.html) — History and concepts
