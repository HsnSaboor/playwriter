# Old vs New Implementation Comparison

## Old Implementation Issues

### Class-Based Complexity

**Old (`cdpRelay.ts`):**
```typescript
export class CDPRelayServer {
  private _wsHost: string
  private _cdpPath: string
  private _extensionPath: string
  private _wss: WebSocketServer
  private _playwrightConnection: WebSocket | null = null
  private _extensionConnection: ExtensionConnection | null = null
  private _connectedTargets: Map<string, ConnectedTarget> = new Map()
  private _extensionConnectionPromise!: ManualPromise<void>

  constructor(server: http.Server) {
    // Initialize all state
    this._wss = new wsServer({ server })
    this._wss.on('connection', (ws, request) => {
      // Complex nested logic
    })
  }

  private _handlePlaywrightConnection(ws: WebSocket): void { }
  private _handleExtensionMessage(message: ExtensionEventMessage) { }
  private async _handlePlaywrightMessage(message: CDPCommand): Promise<void> { }
  private _sendToPlaywright(message: CDPResponse | CDPEvent): void { }
  // ... many more private methods
}

class ExtensionConnection {
  // Nested class with its own state
}
```

**Issues:**
- State scattered across private fields
- Methods mutate class state (`this._playwrightConnection = ws`)
- Nested classes make it hard to follow data flow
- Manual promise management (`ManualPromise`)

### New (Functional):**
```typescript
export async function startRelayServer({ port = 19988 }) {
  const targetsRegistry = createTargetsRegistry()
  let playwrightWs: WSContext | null = null
  let extensionWs: WSContext | null = null
  let extensionConnection: ExtensionConnection | null = null

  // All state is local variables
  // All logic is inline or in pure functions

  return {
    cdpEndpoint,
    extensionEndpoint,
    close() { /* cleanup */ }
  }
}
```

**Benefits:**
- All state in one place (function scope)
- Clear lifecycle (create → use → cleanup)
- No `this`, easier to reason about
- Returns cleanup function

## Message Handling

### Old:
```typescript
// Spread across multiple private methods
private async _handlePlaywrightMessage(message: CDPCommand): Promise<void> {
  const forwardToExtension = async (...) => { }
  const handleCDPCommand = async (...) => {
    switch (method) {
      case 'Browser.getVersion': { }
      case 'Target.setAutoAttach': { }
      // ...
    }
  }
  try {
    const result = await handleCDPCommand(...)
    this._sendToPlaywright({ id, sessionId, result })
  } catch (e) {
    this._sendToPlaywright({ error })
  }
}
```

### New:
```typescript
// CDP routing extracted to dedicated module
const router = createCdpRouter({ targetsRegistry, extensionConnection })
const result: any = await router.route({ method, params, sessionId })
sendToPlaywright({ id, sessionId, result })
```

**Benefits:**
- Separation of concerns
- Router is testable in isolation
- Clear dependencies (passed as args)

## WebSocket Setup

### Old (Manual ws library):
```typescript
this._wss = new wsServer({ server })
this._wss.on('connection', (ws: WebSocket, request: http.IncomingMessage) => {
  const url = new URL(`http://localhost${request.url}`)
  if (url.pathname === this._cdpPath) {
    this._handlePlaywrightConnection(ws)
  } else if (url.pathname === this._extensionPath) {
    this._extensionConnection = new ExtensionConnection(ws)
  }
})
```

### New (Hono WebSocket):
```typescript
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.get('/cdp', upgradeWebSocket(() => ({
  onOpen(_event, ws) { },
  onMessage(event, ws) { },
  onClose() { },
  onError(event) { }
})))

app.get('/extension', upgradeWebSocket(() => ({
  onOpen(_event, ws) { },
  onMessage(event, ws) { },
  onClose() { },
  onError(event) { }
})))
```

**Benefits:**
- Declarative routing
- Built-in event handlers
- Framework handles upgrade protocol
- Cleaner separation between endpoints

## Targets Registry

### Old (Private Map):
```typescript
class CDPRelayServer {
  private _connectedTargets: Map<string, ConnectedTarget> = new Map()

  // Scattered operations
  this._connectedTargets.set(targetParams.sessionId, { ... })
  this._connectedTargets.delete(detachParams.sessionId)
  for (const target of this._connectedTargets.values()) { }
}
```

### New (Functional Registry):
```typescript
function createTargetsRegistry() {
  const targets = new Map<string, ConnectedTarget>()
  return {
    add({ sessionId, targetId, targetInfo }) { },
    remove(sessionId) { },
    get(sessionId) { },
    findByTargetId(targetId) { },
    getAll() { },
    clear() { }
  }
}

const targetsRegistry = createTargetsRegistry()
targetsRegistry.add({ ... })
targetsRegistry.remove(sessionId)
```

**Benefits:**
- Encapsulated state
- Clear API
- Easy to test
- Can be reused

## Logging

### Old:
```typescript
debugLogger(`New connection to ${url.pathname}`)
debugLogger('Rejecting second Playwright connection')
debugLogger('Playwright MCP connected')
debugLogger('Extension WebSocket closed:', reason, c === this._extensionConnection)
debugLogger(`← Playwright: ${message.method} (id=${message.id})`)
debugLogger('\x1b[36m← Playwright:\x1b[0m', `${message.method} (id=${message.id})`)
debugLogger('\x1b[33m← Extension:\x1b[0m', `Target.attachedToTarget ...`)
debugLogger('\x1b[32m→ Playwright:\x1b[0m', logMessage)
debugLogger('\x1b[31mError in the extension:\x1b[0m', e)
```

### New:
```typescript
console.log('Playwright connected')
console.log('Extension connected')
console.log('← Playwright:', `${message.method} (id=${message.id})`)
console.log('← Extension:', method)
console.error('Error handling CDP command:', e)
```

**Benefits:**
- Simple console.log
- Only important events
- No color codes
- No verbose state dumps

## Code Metrics

| Metric | Old | New |
|--------|-----|-----|
| Files | 4 | 2 (relay-server.ts + protocol.ts) |
| Main class LOC | ~417 | 321 (everything inlined) |
| Total LOC | ~600 | ~370 |
| Classes | 2 | 0 |
| Private methods | 10+ | 0 |
| Helper modules | 0 | 0 (all inlined) |
| Dependencies | playwright-core (ws) | hono, @hono/node-ws |

## Migration Path

The new implementation is a drop-in replacement:

**Old:**
```typescript
const httpServer = await startHttpServer({ port: 19988 })
const cdpRelayServer = new CDPRelayServer(httpServer)
cdpRelayServer.stop()
```

**New:**
```typescript
const server = await startRelayServer({ port: 19988 })
server.close()
```
