# API Specification: Persistent Relay Server

## New Exports

### `ensurePersistentRelay()`

```typescript
/**
 * Ensures a playwriter relay server is running as a persistent background process.
 * 
 * This function checks if a relay server is already running at the specified port.
 * If not, it spawns one as a detached process that survives script exit.
 * 
 * @example
 * ```typescript
 * import { ensurePersistentRelay } from 'playwriter'
 * 
 * const { started } = await ensurePersistentRelay()
 * console.log(started ? 'Server started' : 'Server was already running')
 * ```
 */
export async function ensurePersistentRelay(options?: {
  /**
   * Port for the relay server.
   * @default 19988
   */
  port?: number

  /**
   * Timeout in milliseconds to wait for server to start.
   * @default 10000
   */
  timeout?: number

  /**
   * Create automation tabs in a separate Chrome window instead of tab groups.
   * @default false
   */
  separateWindow?: boolean
}): Promise<{
  /** Whether a new server was started (false if already running) */
  started: boolean
  /** Version of the running server */
  version: string
  /** Port the server is running on */
  port: number
}>
```

### `waitForExtension()`

```typescript
/**
 * Waits for the Chrome extension to connect to the relay server.
 * 
 * The extension must be installed and the user must click the extension icon
 * on at least one tab to enable it.
 * 
 * @throws {ExtensionNotConnectedError} If extension doesn't connect within timeout
 * 
 * @example
 * ```typescript
 * import { ensurePersistentRelay, waitForExtension } from 'playwriter'
 * 
 * await ensurePersistentRelay()
 * console.log('Click the Playwriter extension icon...')
 * await waitForExtension({ timeout: 60000 })
 * console.log('Extension connected!')
 * ```
 */
export async function waitForExtension(options?: {
  /**
   * Port of the relay server.
   * @default 19988
   */
  port?: number

  /**
   * Timeout in milliseconds to wait for extension.
   * @default 30000
   */
  timeout?: number

  /**
   * Interval in milliseconds between status checks.
   * @default 500
   */
  pollInterval?: number
}): Promise<{
  /** Whether extension is connected */
  connected: boolean
  /** Number of pages available */
  pageCount: number
}>
```

### `connectToPlaywriter()`

```typescript
/**
 * Connects to a playwriter-controlled Chrome browser using Playwright.
 * 
 * This is the recommended way to use Playwright with playwriter directly.
 * It handles server lifecycle and waits for the extension to connect.
 * 
 * IMPORTANT: Call `browser.disconnect()` when done, NOT `browser.close()`.
 * Closing the browser would close the user's Chrome tabs.
 * 
 * @throws {RelayServerStartError} If server fails to start
 * @throws {ExtensionNotConnectedError} If extension doesn't connect
 * 
 * @example
 * ```typescript
 * import { connectToPlaywriter } from 'playwriter'
 * 
 * const browser = await connectToPlaywriter()
 * const page = browser.contexts()[0].pages()[0]
 * 
 * await page.goto('https://example.com')
 * console.log(await page.title())
 * 
 * await browser.disconnect() // NOT browser.close()
 * ```
 */
export async function connectToPlaywriter(options?: {
  /**
   * Port for the relay server.
   * @default 19988
   */
  port?: number

  /**
   * Timeout in milliseconds for server start and extension connection.
   * @default 30000
   */
  timeout?: number

  /**
   * Create automation tabs in a separate Chrome window instead of tab groups.
   * Provides visual isolation from user's browsing.
   * @default false
   */
  separateWindow?: boolean
}): Promise<Browser>
```

## New Error Classes

### `RelayServerError`

```typescript
/**
 * Base error class for playwriter relay server errors.
 */
export class RelayServerError extends Error {
  /** Port the error relates to */
  readonly port: number

  constructor(message: string, port: number)
}
```

### `ExtensionNotConnectedError`

```typescript
/**
 * Error thrown when extension doesn't connect within timeout.
 */
export class ExtensionNotConnectedError extends RelayServerError {
  constructor(port: number)
}
```

### `RelayServerStartError`

```typescript
/**
 * Error thrown when relay server fails to start.
 */
export class RelayServerStartError extends RelayServerError {
  constructor(port: number)
}
```

## New HTTP Endpoint

### `GET /extension-status`

Returns the current extension connection status.

**Response 200:**

```typescript
interface ExtensionStatus {
  /** Whether extension WebSocket is connected */
  connected: boolean
  
  /** Number of pages/tabs available */
  pageCount: number
  
  /** List of available pages */
  pages: Array<{
    targetId: string
    url: string
    title: string
  }>
}
```

**Example Response:**

```json
{
  "connected": true,
  "pageCount": 2,
  "pages": [
    {
      "targetId": "ABCD1234",
      "url": "https://example.com/",
      "title": "Example Domain"
    },
    {
      "targetId": "EFGH5678", 
      "url": "https://google.com/",
      "title": "Google"
    }
  ]
}
```

## Existing Exports (Unchanged)

These continue to work as before:

```typescript
export { startPlayWriterCDPRelayServer } from './cdp-relay.js'
export { getCdpUrl, LOG_FILE_PATH, VERSION, sleep } from './utils.js'
export { CDPSession, getCDPSessionForPage } from './cdp-session.js'
export { Editor } from './editor.js'
export { Debugger } from './debugger.js'
export { getAriaSnapshot, showAriaRefLabels, hideAriaRefLabels } from './aria-snapshot.js'
```

## Type Exports

```typescript
// Existing
export type { ICDPSession } from './cdp-session.js'
export type { ReadResult, SearchMatch, EditResult } from './editor.js'
export type { BreakpointInfo, LocationInfo, EvaluateResult, ScriptInfo } from './debugger.js'
export type { AriaRef, AriaSnapshotResult } from './aria-snapshot.js'

// New
export type { ExtensionStatus } from './persistent-relay.js'
```

## Environment Variables

Existing environment variables continue to work:

| Variable | Description | Default |
|----------|-------------|---------|
| `PLAYWRITER_PORT` | Relay server port | `19988` |
| `PLAYWRITER_HOST` | Remote relay host | (none, use local) |
| `PLAYWRITER_TOKEN` | Auth token for remote | (none) |
| `PLAYWRITER_SEPARATE_WINDOW` | Create tabs in separate window | (none, use tab groups) |
| `PLAYWRITER_LOG_FILE_PATH` | Log file location | `/tmp/playwriter/relay-server.log` |

## CDP Command Interception

The relay server intercepts certain CDP commands to provide workarounds for methods that would otherwise fail due to page-level limitations.

### Cookie Commands (Transparent Workaround)

These `Storage.*` commands are automatically redirected to equivalent `Network.*` commands:

| Playwright Method | Original CDP | Redirected To | Notes |
|-------------------|--------------|---------------|-------|
| `context.cookies()` | `Storage.getCookies` | `Network.getCookies` | Returns page-scoped cookies |
| `context.addCookies()` | `Storage.setCookies` | `Network.setCookies` | Direct passthrough |
| `context.clearCookies()` | `Storage.clearCookies` | `Network.deleteCookies` | Iterates all cookies |
| `context.storageState()` | `Storage.getCookies` | `Network.getCookies` | Combined with localStorage |

This interception is transparent - no code changes required in user scripts.

### Unsupported Commands

These commands have no page-level equivalent and will throw errors:

| Playwright Method | CDP Command | Error |
|-------------------|-------------|-------|
| `context.grantPermissions()` | `Browser.grantPermissions` | No tab found |
| `context.clearPermissions()` | `Browser.resetPermissions` | No tab found |
| `context.newCDPSession()` (browser) | `Target.attachToBrowserTarget` | No tab found |

See [CDP Cookie Workaround Specification](./cdp-cookie-workaround.md) for details.
