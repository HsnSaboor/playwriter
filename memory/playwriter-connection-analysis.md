# Why Playwright Direct Connection Fails But MCP Works

## Executive Summary

The Playwriter architecture requires a specific initialization sequence that the MCP approach handles correctly, but direct `chromium.connectOverCDP()` calls often miss. The root cause is **timing and process lifecycle management**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLAYWRITER ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Your Script] ←──→ [MCP Server] ←──→ [Relay Server] ←──→ [Extension] ←──→ [Chrome]
│       │                  │                  │                  │              │
│       │                  │                  │                  │              │
│  User Code          bunx playwriter    ws://127.0.0.1:19988   Chrome API    Browser
│                     (stdio transport)   /extension endpoint   debugger      Tabs
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Core Problem

### Direct Playwright Approach (FAILS)

```javascript
import { chromium } from 'playwright-core'
import { startPlayWriterCDPRelayServer, getCdpUrl } from 'playwriter'

const server = await startPlayWriterCDPRelayServer()
const browser = await chromium.connectOverCDP(getCdpUrl())  // ← TIMES OUT
```

**Why it fails:**

1. **Relay server starts in-process** - runs in same Node.js process
2. **Extension not connected yet** - user hasn't clicked extension icon
3. **No pages available** - relay server reports `(extension? false) (0 pages)`
4. **CDP handshake fails** - Playwright sends `Browser.getVersion`, relay has no extension to forward to

### MCP Approach (WORKS)

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'test', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: 'bunx',
  args: ['playwriter'],
})
await client.connect(transport)

// Execute Playwright code via MCP tool
await client.callTool({
  name: 'execute',
  arguments: { code: 'console.log(context.pages().length)' }
})
```

**Why it works:**

1. **Relay server spawns as DETACHED process** - survives script exit
2. **MCP server manages lifecycle** - handles connection state
3. **Extension connection persists** - once green, stays connected to relay
4. **Proper error handling** - MCP returns meaningful errors like "Extension not connected"

---

## Detailed Technical Analysis

### 1. Relay Server Spawning Difference

**MCP Internal Code (from `mcp.ts`):**
```javascript
async function ensureRelayServer() {
  // Check if already running
  const existingVersion = await getServerVersion()
  if (existingVersion) return

  // Spawn as DETACHED background process
  const child = spawn('node', [relayServerPath], {
    detached: true,           // ← KEY: Process survives parent exit
    stdio: 'ignore',
    env: { ...process.env }
  })
  child.unref()               // ← KEY: Don't wait for child
}
```

**Direct startPlayWriterCDPRelayServer():**
```javascript
// Starts server IN-PROCESS using Hono HTTP server
const server = serve({
  fetch: app.fetch,
  port: RELAY_PORT,
  hostname: host,
})
// Server dies when your script exits
```

### 2. Extension Connection State

The Chrome extension connects to `ws://localhost:19988/extension` when:
- User clicks the extension icon (toggles on/off)
- Extension popup shows "Connected" status

**Critical insight:** The extension does NOT auto-reconnect when:
- A new relay server starts (old connection is lost)
- The relay server restarts
- Chrome restarts

**Solution:** User must click extension icon AFTER relay server is running.

### 3. CDP Protocol Flow

When Playwright connects via `connectOverCDP()`:

```
Playwright                  Relay Server              Extension
    │                            │                        │
    │── WS Connect ─────────────→│                        │
    │                            │                        │
    │── Browser.getVersion ─────→│                        │
    │                            │                        │
    │                            │ (if extension=null)    │
    │                            │ return ERROR ──────────│
    │                            │                        │
    │←── Protocol Error ─────────│                        │
    │   "Extension not connected"│                        │
```

When extension IS connected:

```
Playwright                  Relay Server              Extension
    │                            │                        │
    │── WS Connect ─────────────→│                        │
    │                            │                        │
    │── Browser.getVersion ─────→│── Forward ────────────→│
    │                            │                        │
    │                            │←── Response ───────────│
    │                            │                        │
    │←── Version Info ───────────│                        │
    │                            │                        │
    │   (Connection established) │                        │
```

---

## Why MCP Execute Tool Works

The MCP `execute` tool runs Playwright code **inside the MCP server process**, not your script:

```javascript
// Your script
await client.callTool({
  name: 'execute',
  arguments: { code: 'await page.goto("https://example.com")' }
})

// Inside MCP server (mcp.ts)
async function executeHandler(code) {
  // MCP server has its own connection to relay server
  const browser = await chromium.connectOverCDP(getCdpUrl())
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  
  // Evaluate user's code with page/context in scope
  eval(code)
  
  // Return console output
  return { content: consoleOutput }
}
```

**Key difference:** The MCP server:
1. Maintains persistent connection to relay server
2. Reuses existing browser/context/page objects
3. Handles connection errors gracefully
4. Returns structured responses

---

## The Race Condition Problem

### Sequence That FAILS:

```
T+0ms   Script starts
T+10ms  startPlayWriterCDPRelayServer() called
T+50ms  Relay server listening on :19988
T+100ms chromium.connectOverCDP() called
T+110ms Playwright connects to ws://127.0.0.1:19988/cdp/...
T+120ms Playwright sends Browser.getVersion
T+130ms Relay server: "Extension not connected" (extension never clicked!)
T+30100ms Timeout error
```

### Sequence That WORKS (MCP):

```
T+0ms    bunx playwriter starts MCP server
T+50ms   MCP spawns relay server as detached process
T+100ms  Relay server running, logs: "waiting for extension"
T+5000ms User clicks extension icon
T+5050ms Extension connects to ws://localhost:19988/extension
T+5100ms Relay logs: "Extension connected with clean state"
T+10000ms Your script calls execute tool
T+10050ms MCP server connects to relay (extension already connected!)
T+10100ms Commands work perfectly
```

---

## Solutions

### Solution 1: Use MCP SDK (RECOMMENDED)

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'my-app', version: '1.0.0' })

const transport = new StdioClientTransport({
  command: 'bunx',
  args: ['playwriter'],
  stderr: 'pipe',
})

await client.connect(transport)

// Execute Playwright code
const result = await client.callTool({
  name: 'execute',
  arguments: { 
    code: `
      const page = context.pages()[0];
      await page.goto('https://example.com');
      console.log(await page.title());
    `
  }
})

console.log(result.content[0].text)
await client.close()
```

### Solution 2: Keep Relay Server Persistent

1. Start relay server once (systemd/pm2)
2. Click extension once
3. Scripts connect to existing server

```bash
# Start relay server persistently
nohup node /path/to/node_modules/playwriter/dist/start-relay-server.js &

# Click extension icon in Chrome

# Now scripts work without waiting
```

```javascript
import { chromium } from 'playwright-core'

// Relay already running, extension already connected
const browser = await chromium.connectOverCDP('http://127.0.0.1:19988')
const page = browser.contexts()[0].pages()[0]
await page.goto('https://example.com')
```

### Solution 3: Interactive Script with Wait

```javascript
import { chromium } from 'playwright-core'
import { startPlayWriterCDPRelayServer, getCdpUrl } from 'playwriter'
import * as readline from 'readline'

const server = await startPlayWriterCDPRelayServer()

console.log('>>> Click extension icon NOW, then press ENTER <<<')

await new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('', () => { rl.close(); resolve() })
})

// Now extension should be connected
const browser = await chromium.connectOverCDP(getCdpUrl())
```

---

## Connection Persistence

| Component | Persistence |
|-----------|-------------|
| Extension ↔ Relay Server | ✅ Persists while Chrome open & extension green |
| Relay Server Process | ✅ Persists until killed (if detached/systemd) |
| MCP Client ↔ MCP Server | ❌ Per-execution (disconnects when script ends) |
| Playwright ↔ Relay | ❌ Per-execution (must reconnect each time) |

**For 24/7 automation:**
1. Keep Chrome open with extension green
2. Keep relay server running (systemd/pm2)
3. Scripts connect/disconnect as needed

---

## Debugging Checklist

When Playwright connection fails:

1. **Check relay server running:**
   ```bash
   curl http://127.0.0.1:19988/json/version
   # Should return {"Browser":"Playwriter/x.x.x",...}
   ```

2. **Check extension connected:**
   ```bash
   cat /tmp/playwriter/relay-server.log | grep "Extension"
   # Should show: "Extension connected with clean state"
   ```

3. **Check pages available:**
   ```bash
   curl http://127.0.0.1:19988/json/list
   # Should return array of page objects
   ```

4. **Common errors:**
   - `Extension not connected` → Click extension icon
   - `Timeout exceeded` → Extension not connected or wrong relay server
   - `Port 19988 in use` → Kill old process: `lsof -ti:19988 | xargs kill -9`

---

## Files Reference

| File | Purpose |
|------|---------|
| `/home/saboor/test-via-mcp.js` | ✅ Working MCP approach |
| `/home/saboor/test-final.js` | ✅ Working MCP with full output |
| `/home/saboor/test-interactive.js` | Interactive wait for extension |
| `/home/saboor/playwriter-browser.js` | Playwright-like wrapper using MCP |
| `/home/saboor/test-playwright-direct.js` | Direct Playwright (requires manual timing) |

---

## Summary

**The fundamental issue:** Direct Playwright connection assumes the CDP endpoint is ready and has browser targets. Playwriter's relay server only has targets when the Chrome extension is connected.

**The MCP solution works because:**
1. It spawns relay as detached process (persists)
2. It waits for extension connection
3. It manages the connection lifecycle
4. It provides meaningful error messages

**Best practice:** Use the MCP SDK approach or ensure the relay server is running persistently with the extension already connected before your script runs.
