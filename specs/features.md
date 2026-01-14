# Feature Specifications

---

## REJECTED: Private Workspace Mode (Minimized Worker Window)

### Proposal
Create a dedicated minimized "worker window" to contain all automation tabs,
keeping them visually separate from user's main browsing.

### Status: NOT FEASIBLE

**Critical blockers discovered during research:**

1. **CDP commands freeze when window is minimized** (Chromium Issue #40871660)
   - Status: "Won't Fix (Infeasible)" - closed June 2025
   - Mouse movements, tracing, and other CDP commands hang indefinitely
   - Flags like `--disable-renderer-backgrounding` have NO effect
   - Only workaround (Overlay.enable) is hacky and unreliable

2. **chrome.windows.create({ state: 'minimized' }) is broken** in Manifest V3
   - The `state` parameter is ignored; window opens in normal state
   - Workaround (update after create) still hits the CDP freeze issue

3. **Even if minimization worked, automation would hang**
   - Chromium team recommendation: "bring the active tab to front before 
     performing actions that might be throttled"

### Alternative Recommendations

Users wanting visual isolation should use OS-level solutions:
- Move Chrome to a separate virtual desktop (macOS Spaces, Windows Virtual Desktops)
- Use a separate Chrome profile for automation
- Use headless mode for CI environments

### Research Document
See: `docs/research-private-workspace.md`

---

## APPROVED: Separate Window Mode (Opt-in)

### Overview

Allow users to run automation tabs in a **visible separate window** instead of 
tab groups in the main window. This provides visual isolation while avoiding 
the CDP freeze issues that block minimized windows.

### Status: APPROVED FOR IMPLEMENTATION

### Configuration

**1. Environment Variable (MCP users):**
```bash
PLAYWRITER_SEPARATE_WINDOW=1
```

MCP config example:
```json
{
  "mcpServers": {
    "playwriter": {
      "command": "npx",
      "args": ["playwriter@latest"],
      "env": {
        "PLAYWRITER_SEPARATE_WINDOW": "1"
      }
    }
  }
}
```

**2. Programmatic API (Playwright users):**
```typescript
import { connectToPlaywriter } from 'playwriter'

const browser = await connectToPlaywriter({ 
  separateWindow: true 
})
```

**3. Relay Server Option:**
```typescript
import { startPlayWriterCDPRelayServer } from 'playwriter'

await startPlayWriterCDPRelayServer({ 
  separateWindow: true 
})
```

### Behavior

When `separateWindow` is enabled:

1. **First tab creation** creates a new Chrome window (unfocused)
2. **Subsequent tabs** are added to that same window
3. **Window closed by user** → automatically recreates on next tab creation
4. **All tabs disconnected** → window is closed automatically
5. **Tab groups disabled** in separate window mode (not needed)

### Default Behavior (Unchanged)

When `separateWindow` is NOT set (default):
- Tabs created in current window
- Tabs grouped in "playwriter" tab group (green)
- Current behavior preserved

### Window Properties

```typescript
chrome.windows.create({
  url: initialUrl,
  focused: false,      // Don't steal focus
  width: 1200,         // Reasonable default
  height: 800,
  type: 'normal'       // Standard browser window
})
```

### API Changes

**1. `connectToPlaywriter()` options:**
```typescript
interface ConnectOptions {
  port?: number           // Default: 19988
  timeout?: number        // Default: 30000
  separateWindow?: boolean // NEW - Default: false
}
```

**2. `startPlayWriterCDPRelayServer()` options:**
```typescript
interface RelayServerOptions {
  port?: number
  host?: string
  token?: string
  logger?: Logger
  separateWindow?: boolean // NEW - Default: false
}
```

**3. `ensurePersistentRelay()` options:**
```typescript
interface PersistentRelayOptions {
  port?: number
  timeout?: number
  separateWindow?: boolean // NEW - Default: false
}
```

### Extension Protocol Changes

New message from relay server to extension:

```typescript
// Set window mode (sent on extension connect)
{
  method: 'setWindowMode',
  params: {
    separateWindow: boolean
  }
}
```

### Extension State Changes

```typescript
// New state in extension
interface ExtensionState {
  // ... existing fields
  separateWindow: boolean      // NEW
  workerWindowId: number | null // NEW - ID of separate window
}
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| User closes separate window | Recreate on next tab creation |
| User drags tab out of window | Tab continues to work |
| User drags tab into window | Tab continues to work |
| Extension disconnects | Close separate window, reset state |
| Mode changed mid-session | Only affects new tabs |

### Why Not Minimized?

See "REJECTED: Private Workspace Mode" above - CDP commands freeze when 
window is minimized (Chromium bug, marked "Won't Fix").

### Research Document
See: `docs/research-private-workspace.md`

---

# Feature Specification: Persistent Relay Server API

## Overview

Enable direct Playwright usage with playwriter-controlled browsers by exposing
helper functions that manage the relay server lifecycle correctly.

## Problem

Users attempting to use Playwright directly with playwriter face a race condition:

```typescript
// Current approach - FAILS
import { chromium } from 'playwright-core'
import { startPlayWriterCDPRelayServer, getCdpUrl } from 'playwriter'

const server = await startPlayWriterCDPRelayServer()  // In-process server
const browser = await chromium.connectOverCDP(getCdpUrl())  // TIMES OUT
```

**Root cause:** The relay server runs in-process and the extension hasn't connected yet.

## Solution

Expose three new functions that mirror the MCP's internal lifecycle management:

### 1. `ensurePersistentRelay()`

Ensures a relay server is running as a detached background process.

```typescript
export async function ensurePersistentRelay(options?: {
  port?: number      // Default: 19988
  timeout?: number   // Default: 10000ms
}): Promise<{
  started: boolean   // true if we started it, false if already running
  version: string    // Server version
  port: number
}>
```

**Behavior:**
1. Check if server already running at port via `/version` endpoint
2. If running with matching version, return immediately
3. If running with older version, kill and restart
4. If not running, spawn as detached process using same pattern as `mcp.ts`
5. Poll until server responds or timeout

### 2. `waitForExtension()`

Waits for the Chrome extension to connect to the relay server.

```typescript
export async function waitForExtension(options?: {
  port?: number        // Default: 19988
  timeout?: number     // Default: 30000ms
  pollInterval?: number // Default: 500ms
}): Promise<{
  connected: boolean
  pageCount: number
}>
```

**Behavior:**
1. Poll new `/extension-status` endpoint on relay server
2. Return when extension is connected and has at least one page
3. Throw `ExtensionNotConnectedError` on timeout with actionable message

### 3. `connectToPlaywriter()`

Convenience function combining the above with Playwright connection.

```typescript
export async function connectToPlaywriter(options?: {
  port?: number
  timeout?: number
}): Promise<Browser>
```

**Behavior:**
1. Call `ensurePersistentRelay()`
2. Call `waitForExtension()` 
3. Return `chromium.connectOverCDP(getCdpUrl({ port }))`

## New Relay Server Endpoint

### `GET /extension-status`

Returns extension connection status.

**Response:**
```json
{
  "connected": true,
  "pageCount": 2,
  "pages": [
    { "targetId": "abc123", "url": "https://example.com", "title": "Example" }
  ]
}
```

## API Design Decisions

### Why separate functions?

Users may want different levels of control:

```typescript
// Full automation - wait for everything
const browser = await connectToPlaywriter()

// Server management only - user handles extension manually
await ensurePersistentRelay()
console.log('Click extension icon now...')
await waitForExtension()
const browser = await chromium.connectOverCDP(getCdpUrl())

// Just check/start server - for tooling
const { started, version } = await ensurePersistentRelay()
```

### Why return Browser not Context?

Matches Playwright's `connectOverCDP()` return type. Users can access contexts via:
```typescript
const browser = await connectToPlaywriter()
const context = browser.contexts()[0]
const page = context.pages()[0]
```

### Error Handling

New error classes for clear messaging:

```typescript
export class RelayServerError extends Error {
  constructor(message: string, public port: number) {
    super(`[Playwriter] ${message} (port ${port})`)
  }
}

export class ExtensionNotConnectedError extends RelayServerError {
  constructor(port: number) {
    super(
      'Extension not connected. Please click the Playwriter extension icon on a Chrome tab.',
      port
    )
  }
}

export class RelayServerStartError extends RelayServerError {
  constructor(port: number) {
    super(
      `Failed to start relay server. Check logs at: ${LOG_FILE_PATH}`,
      port
    )
  }
}
```

## Usage Examples

### Basic Usage

```typescript
import { connectToPlaywriter } from 'playwriter'

const browser = await connectToPlaywriter()
const page = browser.contexts()[0].pages()[0]
await page.goto('https://example.com')
console.log(await page.title())

// IMPORTANT: disconnect, don't close
await browser.disconnect()
```

### Persistent Server Pattern (Junior Dev's Proposal)

```typescript
// start-server.js - Run once
import { ensurePersistentRelay, waitForExtension } from 'playwriter'

await ensurePersistentRelay()
console.log('Server running. Click extension icon...')
await waitForExtension()
console.log('Ready! Keep this running.')

// Keep alive
setInterval(() => {}, 60000)
```

```typescript
// automation.js - Run repeatedly
import { chromium } from 'playwright-core'
import { getCdpUrl } from 'playwriter'

const browser = await chromium.connectOverCDP(getCdpUrl())
// ... automation code
await browser.disconnect()
```

### CI/Automated Environment

```typescript
import { ensurePersistentRelay, waitForExtension, connectToPlaywriter } from 'playwriter'

// Long timeout for CI where extension auto-enables
const browser = await connectToPlaywriter({ timeout: 60000 })
```

## File Structure

```
playwriter/src/
├── persistent-relay.ts    # NEW: ensurePersistentRelay, waitForExtension, connectToPlaywriter
├── errors.ts              # NEW: RelayServerError, ExtensionNotConnectedError
├── cdp-relay.ts           # MODIFY: Add /extension-status endpoint
├── index.ts               # MODIFY: Export new functions
└── ...
```

## Backward Compatibility

- `startPlayWriterCDPRelayServer()` remains unchanged
- `getCdpUrl()` remains unchanged
- All existing APIs continue to work
- New functions are additive

## Testing\n\nNew test file: `playwriter/test/persistent-relay.test.ts`

Test cases:
1. `ensurePersistentRelay()` starts server if not running
2. `ensurePersistentRelay()` returns immediately if already running
3. `ensurePersistentRelay()` restarts on version mismatch
4. `waitForExtension()` times out with clear error
5. `waitForExtension()` returns when extension connects
6. `connectToPlaywriter()` returns working Browser instance
7. Multiple calls to `connectToPlaywriter()` work

## Documentation Updates

Update `README.md` with new "Direct Playwright Usage" section showing:
1. The problem with in-process servers
2. Solution using `connectToPlaywriter()`
3. Advanced usage with separate functions

---

# Feature Specification: CDP Cookie Workaround

## Overview

Implement transparent CDP command interception in the relay server to make
`context.cookies()`, `context.addCookies()`, `context.clearCookies()`, and
`context.storageState()` work with playwriter-controlled browsers.

## Problem

Playwriter's CDP relay operates at the **page level** via Chrome's `chrome.debugger` API.
Several Playwright context methods fail because they use CDP commands requiring browser-level access:

| Method | CDP Command | Error |
|--------|-------------|-------|
| `context.cookies()` | `Storage.getCookies` | "No tab found" |
| `context.addCookies()` | `Storage.setCookies` | "No tab found" |
| `context.clearCookies()` | `Storage.clearCookies` | "No tab found" |
| `context.storageState()` | `Storage.getCookies` | "No tab found" |

## Solution

Intercept `Storage.*` cookie commands in `cdp-relay.ts` and redirect them to 
equivalent `Network.*` commands that work at page level.

### Command Mapping

| Storage Command | Network Equivalent | Strategy |
|-----------------|-------------------|----------|
| `Storage.getCookies` | `Network.getCookies` | Direct redirect |
| `Storage.setCookies` | `Network.setCookies` | Direct redirect |
| `Storage.clearCookies` | `Network.deleteCookies` | Iterate and delete |

### Implementation Location

Modify `routeCdpCommand()` function in `playwriter/src/cdp-relay.ts`:

```typescript
async function routeCdpCommand({ method, params, sessionId }) {
  switch (method) {
    // ... existing cases
    
    case 'Storage.getCookies': {
      // Redirect to Network.getCookies (page-level)
      return await sendToExtension({
        method: 'forwardCDPCommand',
        params: { 
          sessionId: sessionId || await getAnyActiveSession(),
          method: 'Network.getCookies',
          params: {} 
        }
      })
    }
    
    case 'Storage.setCookies': {
      // Direct passthrough - same cookie format
      return await sendToExtension({
        method: 'forwardCDPCommand',
        params: { 
          sessionId: sessionId || await getAnyActiveSession(),
          method: 'Network.setCookies',
          params: { cookies: params.cookies }
        }
      })
    }
    
    case 'Storage.clearCookies': {
      const targetSession = sessionId || await getAnyActiveSession()
      // Get all cookies first
      const result = await sendToExtension({
        method: 'forwardCDPCommand',
        params: { sessionId: targetSession, method: 'Network.getCookies', params: {} }
      })
      // Delete each cookie
      for (const cookie of result.cookies || []) {
        await sendToExtension({
          method: 'forwardCDPCommand',
          params: { 
            sessionId: targetSession,
            method: 'Network.deleteCookies',
            params: { 
              name: cookie.name,
              domain: cookie.domain,
              path: cookie.path
            }
          }
        })
      }
      return {}
    }
    
    // Default case
    default:
      return await sendToExtension({...})
  }
}
```

### Session Resolution

When no `sessionId` is provided, find an active page session:

```typescript
async function getAnyActiveSession(): Promise<string> {
  // Use extensionState or cached session info
  // If no sessions available, throw descriptive error
  if (!extensionWs || activeSessions.size === 0) {
    throw new Error(
      'No pages available for cookie operation. ' +
      'Click the playwriter extension icon on a Chrome tab first.'
    )
  }
  return activeSessions.values().next().value
}
```

## Behavior

### What Works After Implementation

| Method | Status |
|--------|--------|
| `context.cookies()` | ✅ Returns page-scoped cookies |
| `context.addCookies()` | ✅ Sets cookies for domain |
| `context.clearCookies()` | ✅ Clears all accessible cookies |
| `context.storageState()` | ✅ Returns cookies + localStorage |

### What Still Doesn't Work

| Method | Reason |
|--------|--------|
| `context.grantPermissions()` | No page-level equivalent |
| `context.clearPermissions()` | No page-level equivalent |
| `context.newCDPSession()` (browser) | Requires browser target |

## Limitations

### Cookie Scope

| Aspect | Browser-Level (original) | Page-Level (workaround) |
|--------|--------------------------|-------------------------|
| All browser cookies | ✅ | ❌ Only page-accessible |
| Cross-origin cookies | ✅ | ⚠️ Limited |
| HttpOnly cookies | ✅ | ✅ |
| Secure cookies | ✅ | ✅ |
| Partitioned cookies | ✅ | ✅ |

For most automation use cases, page-scoped cookies are sufficient.

### Performance

`clearCookies()` iterates all cookies and deletes individually.
For pages with many cookies (100+), this may be slower than browser-level clear.

## Testing

Update `playwriter/test/playwright-full-api.ts` to verify these methods now pass:

```typescript
await test('Context', 'context.cookies()', 'context.cookies', async () => {
  const c = await context.cookies()
  if (!Array.isArray(c)) throw new Error('Should return array')
})

await test('Context', 'context.addCookies()', 'context.addCookies', async () => {
  await context.addCookies([{ 
    name: 'test', value: 'val', domain: 'example.com', path: '/' 
  }])
})

await test('Context', 'context.clearCookies()', 'context.clearCookies', async () => {
  await context.clearCookies()
})

await test('Context', 'context.storageState()', 'context.storageState', async () => {
  const state = await context.storageState()
  if (!state) throw new Error('Should return state')
})
```

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| `context.cookies()` | ❌ Fail | ✅ Pass |
| `context.addCookies()` | ❌ Fail | ✅ Pass |
| `context.clearCookies()` | ❌ Fail | ✅ Pass |
| `context.storageState()` | ❌ Fail | ✅ Pass |
| Total API compatibility | 93.8% | 96.2% |

## Research Document

See: `docs/research-cdp-cookie-workaround.md`

## Technical Specification

See: `specs/cdp-cookie-workaround.md`
