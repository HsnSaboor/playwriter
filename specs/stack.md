# Playwriter Architecture - Persistent Server Fix

## Problem Statement

Direct Playwright usage with `chromium.connectOverCDP()` fails due to a **lifecycle mismatch**:

1. User script starts a new relay server in-process
2. Script immediately calls `chromium.connectOverCDP()`
3. Connection times out because extension hasn't connected yet
4. Extension was connected to previous server instance (now dead)
5. User must manually click extension icon to reconnect

The MCP approach works because it spawns the relay server as a **detached background process** that persists across script executions.

## Current Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Script   │────│   MCP Server    │────│  Relay Server   │────│   Extension     │
│   (transient)   │    │  (transient)    │    │   (detached)    │    │   (persistent)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
        │                      │                      │                      │
        │  stdio transport     │  spawns detached     │  ws://19988          │
        │                      │                      │  /extension          │
```

### What Works (MCP Approach)

- `ensureRelayServer()` in mcp.ts spawns relay as **detached process**
- Server persists even after MCP/script exits
- Extension connection remains active
- Subsequent scripts connect to existing server

### What Fails (Direct Playwright)

- `startPlayWriterCDPRelayServer()` runs **in-process**
- Server dies when script exits
- Extension loses connection
- Next script starts fresh server, but extension not connected

## Proposed Solution: Persistent Server Architecture

### Core Insight

The junior dev's proposal is **architecturally sound**. The fix separates:

1. **Server lifecycle** - Run relay server as persistent background process
2. **Script lifecycle** - Scripts connect/disconnect as needed

### Changes Required

#### 1. Expose `ensureRelayServer()` Pattern for Direct Use

Export a helper that mirrors what the MCP does internally:

```typescript
// New export from playwriter package
export async function ensurePersistentRelay(options?: {
  port?: number
  timeout?: number
}): Promise<void>
```

This function:
- Checks if relay server already running at port
- If not, spawns it as detached background process
- Waits until server is ready
- Returns (does NOT return server handle - server runs independently)

#### 2. Add `waitForExtension()` Helper

```typescript
// New export from playwriter package
export async function waitForExtension(options?: {
  port?: number
  timeout?: number
  pollInterval?: number
}): Promise<void>
```

This function:
- Polls the relay server's extension status endpoint
- Returns when extension is connected
- Throws on timeout with helpful error message

#### 3. Provide Combined Convenience Function

```typescript
// New export from playwriter package
export async function connectToPlaywriter(options?: {
  port?: number
  timeout?: number
}): Promise<Browser>
```

This function:
- Calls `ensurePersistentRelay()`
- Calls `waitForExtension()` 
- Returns `chromium.connectOverCDP()` result

### File Changes

| File | Change |
|------|--------|
| `playwriter/src/persistent-relay.ts` | New file with helper functions |
| `playwriter/src/index.ts` | Export new helpers |
| `playwriter/src/cdp-relay.ts` | Add `/extension-status` endpoint |
| `README.md` | Document new approach |

## Technology Stack

No new dependencies required. Uses existing:

- `playwright-core` - Browser connection
- `node:child_process` spawn with `detached: true` - Persistent process
- Hono HTTP server - Existing relay infrastructure
- WebSocket (`ws`) - Existing extension communication

## Why This Approach

| Aspect | In-Process Server | Detached Server |
|--------|-------------------|-----------------|
| Server lifecycle | Dies with script | Persists |
| Extension connection | Lost on script exit | Maintained |
| Subsequent runs | Must reconnect extension | Works immediately |
| Development workflow | Click extension every time | Click once |

## Alternatives Considered

### Alternative A: Auto-reconnect Extension

Have extension detect disconnection and auto-reconnect when server available.

**Rejected because:**
- Complex extension logic
- Still has race condition on first connection
- User must wait for reconnect anyway

### Alternative B: Interactive Wait Prompt

Prompt user to click extension before proceeding.

**Rejected because:**
- Poor developer experience
- Cannot be automated
- Already possible with readline (documented in memory/)

### Alternative C: System Service (systemd/launchd)

Run relay as system service.

**Rejected because:**
- Complex installation
- Different per-platform
- Overkill for development use case

## Recommendation

Implement the **Persistent Server Architecture** as proposed. This is:

1. **Minimal change** - Extracts existing MCP pattern
2. **No breaking changes** - Existing APIs continue to work
3. **Improved DX** - Direct Playwright works reliably
4. **Documented pattern** - Already proven in MCP implementation

## Related Specifications

- **[API Specification](./api.md)** - Function signatures and types
- **[Features Specification](./features.md)** - Feature requirements
- **[CDP Cookie Workaround](./cdp-cookie-workaround.md)** - Fix for context.cookies() and related methods
