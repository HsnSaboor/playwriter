# Implementation: Persistent Relay Server Feature

## Date: 2026-01-14

## Overview

Successfully implemented the "Persistent Server Architecture" fix proposed by the junior dev.
This enables direct Playwright usage with playwriter-controlled browsers without lifecycle mismatch issues.

---

## Problem Solved

**Root Cause:** Direct Playwright `chromium.connectOverCDP()` failed because:
1. User script started relay server in-process
2. Script called `connectOverCDP()` immediately
3. Connection timed out - extension hadn't connected yet
4. Extension was connected to previous (now dead) server

**Solution:** Extract the MCP's pattern of spawning a **detached background process** that persists across script executions.

---

## Files Created

| File | Purpose |
|------|---------|
| `playwriter/src/errors.ts` | Custom error classes with actionable messages |
| `playwriter/src/persistent-relay.ts` | Core functions: `ensurePersistentRelay`, `waitForExtension`, `connectToPlaywriter` |
| `playwriter/test/persistent-relay.test.ts` | 20 E2E tests for new functionality |
| `playwriter/test/playwright-compatibility.ts` | 56 Playwright API compatibility tests |
| `specs/stack.md` | Architecture decision document |
| `specs/features.md` | Feature specification |
| `specs/api.md` | API specification |
| `docs/research-persistent-relay.md` | Research findings |
| `tasks/persistent-relay.md` | 9 atomic implementation tasks |

## Files Modified

| File | Changes |
|------|---------|
| `playwriter/src/cdp-relay.ts` | Added `/extension-status` endpoint |
| `playwriter/src/index.ts` | Added exports for new functions, types, and error classes |
| `README.md` | Added "Using with Playwright (Recommended)", "Persistent Server Pattern", "In-Process Server (Advanced)" sections |
| `playwriter/CHANGELOG.md` | Added version 0.0.47 with new features |

---

## New API

### `connectToPlaywriter()` - Recommended

```typescript
import { connectToPlaywriter } from 'playwriter'

const browser = await connectToPlaywriter()
const page = browser.contexts()[0].pages()[0]

await page.goto('https://example.com')
// NEVER call browser.close() - would close user's tabs!
```

### `ensurePersistentRelay()`

```typescript
import { ensurePersistentRelay } from 'playwriter'

const { started, version, port } = await ensurePersistentRelay()
// started: true if server was spawned, false if already running
```

### `waitForExtension()`

```typescript
import { waitForExtension } from 'playwriter'

const { connected, pageCount, pages } = await waitForExtension({ timeout: 30000 })
```

### New Endpoint: `/extension-status`

```bash
curl http://127.0.0.1:19988/extension-status
# {"connected":true,"pageCount":1,"pages":[{"targetId":"...","url":"...","title":"..."}]}
```

---

## Error Classes

| Class | When Thrown |
|-------|-------------|
| `RelayServerError` | Base class for all relay errors |
| `ExtensionNotConnectedError` | Extension didn't connect within timeout |
| `RelayServerStartError` | Server failed to start |

All errors include port number and actionable messages.

---

## Test Results

### E2E Tests: 20/20 passing
```
✓ ensurePersistentRelay starts server if not running
✓ ensurePersistentRelay returns false if already running
✓ waitForExtension returns status when connected
✓ waitForExtension throws ExtensionNotConnectedError on timeout
✓ connectToPlaywriter returns Browser instance
✓ ...
```

### Playwright Compatibility: 56/56 passing (100%)
- Connection & Setup (4 tests)
- Browser & Context (4 tests)
- Page Navigation (5 tests)
- DOM Operations (9 tests)
- JavaScript Evaluation (5 tests)
- User Interactions (5 tests)
- Waiting (4 tests)
- Screenshots (3 tests)
- Frames (3 tests)
- Network Events (2 tests)
- Console Events (2 tests)
- Viewport (2 tests)
- Accessibility (1 test)
- Advanced Selectors (6 tests)
- Multiple Connections (1 test)

---

## Known Limitations

### Bun vs Node.js

**Issue:** Playwright tests fail when run with `bun` but pass with `npx tsx` (Node.js).

**Cause:** Bun has Playwright compatibility issues with CDP WebSocket connections.

**Workaround:** Run Playwright tests with Node.js:
```bash
# DON'T
bun run test/playwright-compatibility.ts

# DO
npx tsx test/playwright-compatibility.ts
```

### spawn() Command

The `ensurePersistentRelay()` function uses `bun` to spawn the server because:
1. `tsx` is not in system PATH for detached processes
2. `bun` can run `.ts` files natively
3. `bun` is available in user's PATH

If running in production with compiled `.js` files, it uses `node` instead.

---

## Task Completion

| Task | Status |
|------|--------|
| 1. Create Error Classes | ✅ Complete |
| 2. Add /extension-status Endpoint | ✅ Complete |
| 3. Create ensurePersistentRelay() | ✅ Complete |
| 4. Create waitForExtension() | ✅ Complete |
| 5. Create connectToPlaywriter() | ✅ Complete |
| 6. Export New Functions from Index | ✅ Complete |
| 7. Write Unit Tests | ✅ Complete (20 tests) |
| 8. Update README Documentation | ✅ Complete |
| 9. Update CHANGELOG | ✅ Complete |

---

## Next Steps

1. **Commit changes** - All implementation complete
2. **Bump version** - Update `package.json` to 0.0.47 and `extension/manifest.json`
3. **Build & Publish** - Run `pnpm build` and publish to npm
4. **Document bun limitation** - Consider adding note about Node.js for Playwright tests
