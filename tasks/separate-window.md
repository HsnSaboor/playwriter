# Tasks: Separate Window Mode

## Overview

Implementation tasks for opt-in separate window mode feature.
Each task is < 1 hour and produces a committable unit.

**Spec:** `specs/features.md` (APPROVED: Separate Window Mode)
**Research:** `docs/research-private-workspace.md`

---

## Task 1: Add Extension State for Window Mode

**File:** `extension/src/types.ts`

**Description:**
Add new fields to ExtensionState interface for tracking window mode.

**Changes:**
```typescript
// Add to TabInfo or ExtensionState
interface ExtensionState {
  // ... existing fields
  separateWindow: boolean
  workerWindowId: number | null
}
```

**Verification:**
- [ ] TypeScript compiles without errors
- [ ] `pnpm build` succeeds in extension folder

**Estimated time:** 15 minutes

---

## Task 2: Handle setWindowMode Message in Extension

**File:** `extension/src/background.ts`

**Description:**
Add handler for `setWindowMode` message from relay server.

**Changes:**
```typescript
// In ws.onmessage handler, add:
if (message.method === 'setWindowMode') {
  const { separateWindow } = message.params
  store.setState({ separateWindow, workerWindowId: null })
  sendMessage({ id: message.id, result: { success: true } })
  return
}
```

**Verification:**
- [ ] Extension builds without errors
- [ ] Manually test: send setWindowMode message, verify state updates

**Estimated time:** 20 minutes

---

## Task 3: Implement createTabInWorkerWindow Function

**File:** `extension/src/background.ts`

**Description:**
Create helper function to create tabs in a separate worker window.

**Implementation:**
```typescript
async function createTabInWorkerWindow(url: string): Promise<chrome.tabs.Tab> {
  const { workerWindowId } = store.getState()
  
  if (workerWindowId) {
    // Verify window still exists
    try {
      await chrome.windows.get(workerWindowId)
      // Add tab to existing window
      return await chrome.tabs.create({ 
        windowId: workerWindowId, 
        url, 
        active: false 
      })
    } catch {
      // Window was closed, reset and create new one
      store.setState({ workerWindowId: null })
    }
  }
  
  // Create new worker window with first tab
  const win = await chrome.windows.create({ 
    url, 
    focused: false,
    width: 1200,
    height: 800
  })
  
  store.setState({ workerWindowId: win.id! })
  return win.tabs![0]
}
```

**Verification:**
- [ ] TypeScript compiles
- [ ] Function creates window on first call
- [ ] Function reuses window on subsequent calls
- [ ] Function self-heals if window closed by user

**Estimated time:** 30 minutes

---

## Task 4: Modify Tab Creation to Use Worker Window

**File:** `extension/src/background.ts`

**Description:**
Update `createInitialTab` and `Target.createTarget` handlers to use 
`createTabInWorkerWindow` when separateWindow mode is enabled.

**Changes:**
```typescript
// In createInitialTab handler:
if (message.method === 'createInitialTab') {
  const { separateWindow } = store.getState()
  const tab = separateWindow
    ? await createTabInWorkerWindow('about:blank')
    : await chrome.tabs.create({ url: 'about:blank', active: false })
  // ... rest of handler
}

// In Target.createTarget handler:
case 'Target.createTarget': {
  const url = msg.params.params?.url || 'about:blank'
  const { separateWindow } = store.getState()
  const tab = separateWindow
    ? await createTabInWorkerWindow(url)
    : await chrome.tabs.create({ url, active: false })
  // ... rest of handler
}
```

**Verification:**
- [ ] With separateWindow=false: tabs created in current window (existing behavior)
- [ ] With separateWindow=true: tabs created in separate window

**Estimated time:** 30 minutes

---

## Task 5: Disable Tab Groups in Separate Window Mode

**File:** `extension/src/background.ts`

**Description:**
Skip tab group syncing when in separate window mode (groups not needed).

**Changes:**
```typescript
// In syncTabGroup function:
async function syncTabGroup(): Promise<void> {
  const { separateWindow } = store.getState()
  if (separateWindow) {
    return // Skip grouping in separate window mode
  }
  // ... existing implementation
}
```

**Verification:**
- [ ] With separateWindow=false: tab groups work as before
- [ ] With separateWindow=true: no tab groups created

**Estimated time:** 10 minutes

---

## Task 6: Close Worker Window on Disconnect

**File:** `extension/src/background.ts`

**Description:**
Close the worker window when extension disconnects or all tabs are removed.

**Changes:**
```typescript
// In ConnectionManager.handleClose():
const { workerWindowId } = store.getState()
if (workerWindowId) {
  chrome.windows.remove(workerWindowId).catch(() => {})
}
store.setState({ workerWindowId: null, separateWindow: false })

// In store subscribe (when tabs become empty):
if (state.separateWindow && state.tabs.size === 0 && state.workerWindowId) {
  chrome.windows.remove(state.workerWindowId).catch(() => {})
  store.setState({ workerWindowId: null })
}
```

**Verification:**
- [ ] Disconnect closes worker window
- [ ] All tabs removed closes worker window

**Estimated time:** 20 minutes

---

## Task 7: Add separateWindow Option to Relay Server

**File:** `playwriter/src/cdp-relay.ts`

**Description:**
Add `separateWindow` parameter and send `setWindowMode` message on extension connect.

**Changes:**
```typescript
// Add to function signature:
export async function startPlayWriterCDPRelayServer({ 
  port, host, token, logger,
  separateWindow = false  // NEW
}: { 
  // ... existing params
  separateWindow?: boolean
} = {}): Promise<RelayServer>

// In extension onOpen handler:
onOpen(_event, ws) {
  // ... existing code
  
  // Send window mode to extension
  if (separateWindow) {
    ws.send(JSON.stringify({ 
      method: 'setWindowMode', 
      params: { separateWindow: true } 
    }))
  }
}
```

**Verification:**
- [ ] TypeScript compiles
- [ ] Extension receives setWindowMode message when enabled
- [ ] Default behavior unchanged

**Estimated time:** 25 minutes

---

## Task 8: Add separateWindow to Persistent Relay Functions

**File:** `playwriter/src/persistent-relay.ts`

**Description:**
Pass `separateWindow` option through ensurePersistentRelay and connectToPlaywriter.

**Changes:**
```typescript
// Update ensurePersistentRelay options type
export async function ensurePersistentRelay(options?: {
  port?: number
  timeout?: number
  separateWindow?: boolean  // NEW
}): Promise<...>

// Update connectToPlaywriter options type
export async function connectToPlaywriter(options?: {
  port?: number
  timeout?: number
  separateWindow?: boolean  // NEW
}): Promise<Browser>

// Pass option when spawning server
```

**Verification:**
- [ ] TypeScript compiles
- [ ] Options are passed correctly to server

**Estimated time:** 20 minutes

---

## Task 9: Read PLAYWRITER_SEPARATE_WINDOW Environment Variable

**File:** `playwriter/src/cdp-relay.ts` and `playwriter/src/cli.ts`

**Description:**
Check environment variable to enable separate window mode.

**Changes:**
```typescript
// In cdp-relay.ts:
const separateWindowEnv = !!process.env.PLAYWRITER_SEPARATE_WINDOW
const effectiveSeparateWindow = separateWindow ?? separateWindowEnv

// In cli.ts (serve command):
const separateWindow = !!process.env.PLAYWRITER_SEPARATE_WINDOW
```

**Verification:**
- [ ] `PLAYWRITER_SEPARATE_WINDOW=1 npx playwriter` enables separate window
- [ ] Programmatic option overrides env var

**Estimated time:** 15 minutes

---

## Task 10: Add Tests for Separate Window Mode

**File:** `playwriter/src/mcp.test.ts`

**Description:**
Add integration tests for separate window mode.

**Test cases:**
```typescript
test('separateWindow creates tabs in new window', async () => {
  // Enable separate window mode
  // Create tabs
  // Verify all tabs are in same window (different from main)
})

test('separateWindow recreates window if closed', async () => {
  // Enable mode, create tab, close window
  // Create another tab
  // Verify new window created
})

test('default mode uses tab groups', async () => {
  // Create tabs without separateWindow
  // Verify tabs are in playwriter group
})
```

**Verification:**
- [ ] All tests pass
- [ ] `pnpm test` succeeds

**Estimated time:** 45 minutes

---

## Task 11: Update README Documentation

**File:** `README.md`

**Description:**
Document the separate window mode feature.

**Add section:**
```markdown
### Separate Window Mode

Run automation tabs in a dedicated browser window:

**MCP config:**
\`\`\`json
{
  "env": { "PLAYWRITER_SEPARATE_WINDOW": "1" }
}
\`\`\`

**Programmatic:**
\`\`\`typescript
const browser = await connectToPlaywriter({ separateWindow: true })
\`\`\`
```

**Verification:**
- [ ] Documentation is clear and accurate
- [ ] Examples work correctly

**Estimated time:** 15 minutes

---

## Task 12: Update CHANGELOG

**File:** `playwriter/CHANGELOG.md`

**Description:**
Add changelog entry for the new feature.

**Entry:**
```markdown
## [Unreleased]

### Added
- Separate window mode (`PLAYWRITER_SEPARATE_WINDOW` env var or `separateWindow` option)
  - Creates automation tabs in a dedicated browser window instead of tab groups
  - Provides visual isolation from user's browsing
  - Auto-closes window when all tabs disconnect
```

**Verification:**
- [ ] Changelog follows existing format
- [ ] Feature described accurately

**Estimated time:** 10 minutes

---

## Summary

| Task | Time | Component |
|------|------|-----------|
| 1. Extension state types | 15m | extension |
| 2. Handle setWindowMode | 20m | extension |
| 3. createTabInWorkerWindow | 30m | extension |
| 4. Modify tab creation | 30m | extension |
| 5. Disable tab groups | 10m | extension |
| 6. Close window on disconnect | 20m | extension |
| 7. Relay server option | 25m | playwriter |
| 8. Persistent relay options | 20m | playwriter |
| 9. Environment variable | 15m | playwriter |
| 10. Integration tests | 45m | playwriter |
| 11. README docs | 15m | docs |
| 12. Changelog | 10m | docs |
| **Total** | **~4.5 hours** | |

## Implementation Order

Recommended order for minimal broken states:

1. Tasks 1-6 (Extension changes - can be done together)
2. Tasks 7-9 (Server/API changes)
3. Task 10 (Tests)
4. Tasks 11-12 (Documentation)
