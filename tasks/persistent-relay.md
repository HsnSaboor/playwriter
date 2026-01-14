# Tasks: Persistent Relay Server Feature

## Overview

Implementation tasks for enabling direct Playwright usage with playwriter.
Each task is < 1 hour and produces a committable unit.

---

## Task 1: Create Error Classes

**File:** `playwriter/src/errors.ts`

**Description:**
Create custom error classes for relay server errors with clear, actionable messages.

**Implementation:**
```typescript
import { LOG_FILE_PATH } from './utils.js'

export class RelayServerError extends Error {
  readonly port: number

  constructor(message: string, port: number) {
    super(`[Playwriter] ${message} (port ${port})`)
    this.name = 'RelayServerError'
    this.port = port
  }
}

export class ExtensionNotConnectedError extends RelayServerError {
  constructor(port: number) {
    super(
      'Extension not connected. Please click the Playwriter extension icon on a Chrome tab.',
      port
    )
    this.name = 'ExtensionNotConnectedError'
  }
}

export class RelayServerStartError extends RelayServerError {
  constructor(port: number) {
    super(
      `Failed to start relay server. Check logs at: ${LOG_FILE_PATH}`,
      port
    )
    this.name = 'RelayServerStartError'
  }
}
```

**Verification:**
- [ ] File compiles without errors: `cd playwriter && pnpm tsc --noEmit`
- [ ] Errors extend Error correctly
- [ ] Error messages include port number
- [ ] `RelayServerStartError` includes log file path

**Estimated time:** 15 minutes

---

## Task 2: Add `/extension-status` Endpoint

**File:** `playwriter/src/cdp-relay.ts`

**Description:**
Add HTTP endpoint to check if extension is connected and list available pages.

**Implementation:**
Add after existing routes (around line 200):

```typescript
app.get('/extension-status', (c) => {
  const pages = Array.from(connectedTargets.values()).map((t) => ({
    targetId: t.targetId,
    url: t.targetInfo.url,
    title: t.targetInfo.title,
  }))

  return c.json({
    connected: extensionWs !== null,
    pageCount: connectedTargets.size,
    pages,
  })
})
```

**Verification:**
- [ ] Start relay server: `cd playwriter && pnpm tsx scripts/extension-server.ts`
- [ ] Endpoint responds: `curl http://127.0.0.1:19988/extension-status`
- [ ] Returns `{ "connected": false, "pageCount": 0, "pages": [] }` without extension
- [ ] Returns `{ "connected": true, ... }` after extension connects
- [ ] TypeScript compiles: `cd playwriter && pnpm tsc --noEmit`

**Estimated time:** 20 minutes

---

## Task 3: Create `ensurePersistentRelay()` Function

**File:** `playwriter/src/persistent-relay.ts`

**Description:**
Create function that ensures relay server is running as detached background process.
Extract pattern from `mcp.ts:ensureRelayServer()`.

**Implementation:**
```typescript
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { VERSION, sleep } from './utils.js'
import { RelayServerStartError } from './errors.js'
import { killPortProcess } from 'kill-port-process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

const DEFAULT_PORT = 19988
const DEFAULT_TIMEOUT = 10000

async function getServerVersion(port: number): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/version`, {
      signal: AbortSignal.timeout(500),
    })
    if (!response.ok) {
      return null
    }
    const data = (await response.json()) as { version: string }
    return data.version
  } catch {
    return null
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  const len = Math.max(parts1.length, parts2.length)
  for (let i = 0; i < len; i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 !== p2) {
      return p1 - p2
    }
  }
  return 0
}

export interface EnsurePersistentRelayResult {
  started: boolean
  version: string
  port: number
}

export async function ensurePersistentRelay(options?: {
  port?: number
  timeout?: number
}): Promise<EnsurePersistentRelayResult> {
  const port = options?.port ?? DEFAULT_PORT
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT

  const existingVersion = await getServerVersion(port)

  // Already running with same or newer version
  if (existingVersion !== null && compareVersions(existingVersion, VERSION) >= 0) {
    return { started: false, version: existingVersion, port }
  }

  // Kill old version if running
  if (existingVersion !== null) {
    try {
      await killPortProcess(port)
      await sleep(500)
    } catch {}
  }

  // Spawn detached server
  const dev = process.env.PLAYWRITER_NODE_ENV === 'development'
  const scriptPath = dev
    ? path.resolve(__dirname, './start-relay-server.ts')
    : require.resolve('./start-relay-server.js')

  const serverProcess = spawn(dev ? 'tsx' : process.execPath, [scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  serverProcess.unref()

  // Poll until ready
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    await sleep(500)
    const version = await getServerVersion(port)
    if (version === VERSION) {
      return { started: true, version, port }
    }
  }

  throw new RelayServerStartError(port)
}
```

**Verification:**
- [ ] TypeScript compiles: `cd playwriter && pnpm tsc --noEmit`
- [ ] Function starts server when not running
- [ ] Function returns immediately if server already running
- [ ] Server survives after calling script exits
- [ ] Throws `RelayServerStartError` on timeout

**Estimated time:** 30 minutes

---

## Task 4: Create `waitForExtension()` Function

**File:** `playwriter/src/persistent-relay.ts` (append)

**Description:**
Create function that polls `/extension-status` until extension connects.

**Implementation:**
```typescript
import { ExtensionNotConnectedError } from './errors.js'

export interface ExtensionStatus {
  connected: boolean
  pageCount: number
  pages: Array<{
    targetId: string
    url: string
    title: string
  }>
}

export interface WaitForExtensionResult {
  connected: boolean
  pageCount: number
}

export async function waitForExtension(options?: {
  port?: number
  timeout?: number
  pollInterval?: number
}): Promise<WaitForExtensionResult> {
  const port = options?.port ?? DEFAULT_PORT
  const timeout = options?.timeout ?? 30000
  const pollInterval = options?.pollInterval ?? 500

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/extension-status`, {
        signal: AbortSignal.timeout(1000),
      })

      if (response.ok) {
        const status = (await response.json()) as ExtensionStatus
        if (status.connected && status.pageCount > 0) {
          return { connected: true, pageCount: status.pageCount }
        }
      }
    } catch {
      // Server might not be ready yet
    }

    await sleep(pollInterval)
  }

  throw new ExtensionNotConnectedError(port)
}
```

**Verification:**
- [ ] TypeScript compiles: `cd playwriter && pnpm tsc --noEmit`
- [ ] Function returns when extension connects
- [ ] Function throws `ExtensionNotConnectedError` on timeout
- [ ] Poll interval is respected

**Estimated time:** 20 minutes

---

## Task 5: Create `connectToPlaywriter()` Function

**File:** `playwriter/src/persistent-relay.ts` (append)

**Description:**
Create convenience function combining server, extension, and Playwright connection.

**Implementation:**
```typescript
import { chromium, Browser } from 'playwright-core'
import { getCdpUrl } from './utils.js'

export async function connectToPlaywriter(options?: {
  port?: number
  timeout?: number
}): Promise<Browser> {
  const port = options?.port ?? DEFAULT_PORT
  const timeout = options?.timeout ?? 30000

  await ensurePersistentRelay({ port, timeout })
  await waitForExtension({ port, timeout })

  const cdpUrl = getCdpUrl({ port })
  const browser = await chromium.connectOverCDP(cdpUrl)

  return browser
}
```

**Verification:**
- [ ] TypeScript compiles: `cd playwriter && pnpm tsc --noEmit`
- [ ] Returns working Browser instance
- [ ] Browser can access pages
- [ ] Works with custom port option

**Estimated time:** 15 minutes

---

## Task 6: Export New Functions from Index

**File:** `playwriter/src/index.ts`

**Description:**
Export all new functions and types from the package entry point.

**Implementation:**
```typescript
// Add to existing exports:
export {
  ensurePersistentRelay,
  waitForExtension,
  connectToPlaywriter,
} from './persistent-relay.js'

export type {
  EnsurePersistentRelayResult,
  WaitForExtensionResult,
  ExtensionStatus,
} from './persistent-relay.js'

export {
  RelayServerError,
  ExtensionNotConnectedError,
  RelayServerStartError,
} from './errors.js'
```

**Verification:**
- [ ] TypeScript compiles: `cd playwriter && pnpm tsc --noEmit`
- [ ] Can import from 'playwriter': `import { connectToPlaywriter } from 'playwriter'`
- [ ] Types are exported correctly

**Estimated time:** 10 minutes

---

## Task 7: Write Unit Tests

**File:** `playwriter/test/persistent-relay.test.ts`

**Description:**
Write tests for new functions using existing test infrastructure.

**Test Cases:**
1. `ensurePersistentRelay()` starts server if not running
2. `ensurePersistentRelay()` returns `started: false` if already running
3. `waitForExtension()` throws on timeout (short timeout, no extension)
4. `/extension-status` endpoint returns correct structure
5. Full integration: `connectToPlaywriter()` with extension enabled

**Verification:**
- [ ] All tests pass: `cd playwriter && pnpm test --run`
- [ ] Tests use existing test patterns from `mcp.test.ts`
- [ ] Tests clean up after themselves (kill servers)

**Estimated time:** 45 minutes

---

## Task 8: Update README Documentation

**File:** `README.md`

**Description:**
Add "Direct Playwright Usage" section documenting new API.

**Content to add:**
```markdown
## Direct Playwright Usage

If you prefer using Playwright directly instead of the MCP tools:

### Quick Start

```typescript
import { connectToPlaywriter } from 'playwriter'

const browser = await connectToPlaywriter()
const page = browser.contexts()[0].pages()[0]

await page.goto('https://example.com')
console.log(await page.title())

// IMPORTANT: Use disconnect(), not close()
await browser.disconnect()
```

### Advanced: Persistent Server

For repeated automation runs, start the server once:

```typescript
// Terminal 1: Start server (run once)
import { ensurePersistentRelay, waitForExtension } from 'playwriter'

await ensurePersistentRelay()
console.log('Click extension icon...')
await waitForExtension()
console.log('Ready!')
setInterval(() => {}, 60000) // Keep alive
```

```typescript
// Terminal 2: Run scripts repeatedly
import { chromium } from 'playwright-core'
import { getCdpUrl } from 'playwriter'

const browser = await chromium.connectOverCDP(getCdpUrl())
// ... your automation code
await browser.disconnect()
```
```

**Verification:**
- [ ] Documentation renders correctly on GitHub
- [ ] Code examples are syntactically correct
- [ ] Examples match actual API signatures

**Estimated time:** 20 minutes

---

## Task 9: Update CHANGELOG

**File:** `playwriter/CHANGELOG.md`

**Description:**
Document new features in changelog.

**Content:**
```markdown
## [0.0.X] - YYYY-MM-DD

### Added
- `connectToPlaywriter()` - Connect to browser with automatic server management
- `ensurePersistentRelay()` - Start relay server as persistent background process
- `waitForExtension()` - Wait for Chrome extension to connect
- `/extension-status` endpoint - Check extension connection status
- New error classes: `RelayServerError`, `ExtensionNotConnectedError`, `RelayServerStartError`
```

**Verification:**
- [ ] Version number is correct
- [ ] Date is filled in
- [ ] All new features listed

**Estimated time:** 10 minutes

---

## Summary

| Task | File(s) | Time |
|------|---------|------|
| 1. Error classes | `errors.ts` | 15 min |
| 2. Extension status endpoint | `cdp-relay.ts` | 20 min |
| 3. `ensurePersistentRelay()` | `persistent-relay.ts` | 30 min |
| 4. `waitForExtension()` | `persistent-relay.ts` | 20 min |
| 5. `connectToPlaywriter()` | `persistent-relay.ts` | 15 min |
| 6. Export from index | `index.ts` | 10 min |
| 7. Unit tests | `persistent-relay.test.ts` | 45 min |
| 8. README docs | `README.md` | 20 min |
| 9. Changelog | `CHANGELOG.md` | 10 min |
| **Total** | | **~3 hours** |

## Dependencies

```
Task 1 ──┐
         ├──► Task 3 ──┐
Task 2 ──┘             ├──► Task 5 ──► Task 6 ──► Task 7
                       │
         Task 4 ───────┘

Task 8, Task 9 can be done in parallel after Task 6
```

## Commit Strategy

Suggested commits:
1. `feat(relay): add error classes for persistent relay`
2. `feat(relay): add /extension-status endpoint`
3. `feat(relay): add ensurePersistentRelay and waitForExtension`
4. `feat(relay): add connectToPlaywriter convenience function`
5. `test(relay): add tests for persistent relay functions`
6. `docs: add direct Playwright usage documentation`
