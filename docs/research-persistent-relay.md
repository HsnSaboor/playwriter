# Research: Persistent Server Architecture Fix

## Context

This document captures findings from analyzing the playwriter codebase to understand
why direct Playwright usage fails and how to fix it.

## Source Files Analyzed

1. `memory/session-findings.md` - Previous debugging session findings
2. `memory/playwriter-connection-analysis.md` - Root cause analysis
3. `memory/playwriter-architecture-diagrams.md` - Architecture documentation
4. `playwriter/src/mcp.ts` - MCP server implementation
5. `playwriter/src/cdp-relay.ts` - Relay server implementation
6. `playwriter/src/utils.ts` - Utility functions

## Key Finding: MCP's `ensureRelayServer()` Pattern

The MCP already solves this problem internally. Located in `mcp.ts` lines 345-395:

```typescript
async function ensureRelayServer(): Promise<void> {
  const serverVersion = await getServerVersion(RELAY_PORT)

  if (serverVersion === VERSION) {
    return
  }

  // Don't restart if server version is higher than MCP version.
  if (serverVersion !== null && compareVersions(serverVersion, VERSION) > 0) {
    return
  }

  if (serverVersion !== null) {
    mcpLog(`CDP relay server version mismatch, restarting...`)
    await killRelayServer(RELAY_PORT)
  } else {
    mcpLog('CDP relay server not running, starting it...')
  }

  const scriptPath = require.resolve('../dist/start-relay-server.js')

  const serverProcess = spawn(process.execPath, [scriptPath], {
    detached: true,        // KEY: Survives parent exit
    stdio: 'ignore',
  })

  serverProcess.unref()   // KEY: Don't wait for child

  // Poll until ready
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    const newVersion = await getServerVersion(RELAY_PORT)
    if (newVersion === VERSION) {
      return
    }
  }

  throw new Error('Failed to start CDP relay server')
}
```

**Key insight:** Using `detached: true` and `unref()` makes the server persist.

## Why In-Process Server Fails

The `startPlayWriterCDPRelayServer()` function runs the Hono server in-process:

```typescript
// cdp-relay.ts line ~33
export async function startPlayWriterCDPRelayServer(...) {
  // Server runs IN this process
  const server = serve({
    fetch: app.fetch,
    port: RELAY_PORT,
  })
  
  return { close: () => server.close() }
}
```

When the script exits, the server dies. The extension loses its WebSocket connection.

## Sequence Comparison

### Direct (Fails)

```
T+0     Script starts
T+10    startPlayWriterCDPRelayServer() - server in-process
T+50    chromium.connectOverCDP() - extension not connected!
T+30000 Timeout error
```

### MCP (Works)

```
T+0     bunx playwriter - MCP starts
T+10    ensureRelayServer() - spawns detached process
T+50    Server running, MCP exits, SERVER STILL ALIVE
T+5000  User clicks extension
T+5050  Extension connects to persistent server
T+10000 Script calls execute tool - works!
```

## Extension Status Visibility

Currently no way to check if extension is connected via HTTP. Must add endpoint.

The relay server tracks extension connection in `extensionWs` variable:

```typescript
// cdp-relay.ts
let extensionWs: WSContext | null = null

// On /extension WebSocket open:
extensionWs = ws

// On /extension WebSocket close:
extensionWs = null
```

Can expose this via new endpoint:

```typescript
app.get('/extension-status', (c) => {
  return c.json({
    connected: extensionWs !== null,
    pageCount: connectedTargets.size,
    pages: Array.from(connectedTargets.values()).map(t => ({
      targetId: t.targetId,
      url: t.targetInfo.url,
      title: t.targetInfo.title,
    }))
  })
})
```

## Junior Dev Proposal Evaluation

The junior dev's proposal is correct in identifying:

1. **Root cause**: Lifecycle mismatch between server and extension
2. **Solution**: Separate server lifecycle from script lifecycle
3. **Pattern**: Run server once, connect scripts repeatedly

Their code example works but has minor issues:

```typescript
// Their approach - works but verbose
import { startPlayWriterCDPRelayServer } from 'playwriter'

try {
  await startPlayWriterCDPRelayServer({ port: PORT })
} catch (error) {
  if (error.code === 'EADDRINUSE') {
    // Already running - OK
  }
}

setInterval(() => {}, 1000 * 60 * 60)  // Keep alive
```

**Better approach**: Extract MCP's pattern into reusable function.

## Recommendations

1. **Extract `ensureRelayServer()` pattern** from mcp.ts into new file
2. **Add `/extension-status` endpoint** to relay server
3. **Create `waitForExtension()` helper** that polls status endpoint
4. **Create `connectToPlaywriter()` convenience function** combining all steps
5. **Update documentation** with new approach

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `playwriter/src/persistent-relay.ts` | New helper functions |
| CREATE | `playwriter/src/errors.ts` | Error classes |
| MODIFY | `playwriter/src/cdp-relay.ts` | Add `/extension-status` endpoint |
| MODIFY | `playwriter/src/index.ts` | Export new functions |
| MODIFY | `README.md` | Document new approach |
| CREATE | `playwriter/test/persistent-relay.test.ts` | Tests for new functions |
