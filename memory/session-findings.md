# Playwriter Session Findings

## Date: 2024-01-14

## What Works

### 1. MCP SDK Approach ✅
```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'test', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: 'bunx',
  args: ['playwriter'],
})
await client.connect(transport)

// This works!
await client.callTool({
  name: 'execute',
  arguments: { code: 'console.log(context.pages().length)' }
})
```

**Working test files:**
- `/home/saboor/test-via-mcp.js`
- `/home/saboor/test-final.js`

### 2. Extension Connection (when done correctly) ✅
- Extension connects to `ws://localhost:19988/extension`
- Icon turns green when connected
- Relay server logs show: `Extension connected with clean state`
- Pages are visible via `/json/list` endpoint

### 3. Relay Server ✅
- Starts correctly via `startPlayWriterCDPRelayServer()`
- Listens on port 19988
- Serves `/json/version`, `/json/list` endpoints
- WebSocket endpoints work: `/extension`, `/cdp/:clientId`

---

## What Doesn't Work

### 1. Direct Playwright Connection ❌
```javascript
import { chromium } from 'playwright-core'
import { startPlayWriterCDPRelayServer, getCdpUrl } from 'playwriter'

const server = await startPlayWriterCDPRelayServer()
const browser = await chromium.connectOverCDP(getCdpUrl())  // TIMES OUT
```

**Error:** `TimeoutError: overCDP: Timeout 30000ms exceeded`

**Root Cause:** Race condition - Playwright tries to connect before extension is connected to relay server.

### 2. CLI `serve` Command Without Token ❌
```bash
npx playwriter serve --host 127.0.0.1
# Error: Authentication token is required.
```

**Issue:** No `--no-token` option for local development.

### 3. Auto-Toggle Extension ❌
- `PLAYWRITER_AUTO_ENABLE=1` only creates new blank tab
- Cannot programmatically toggle existing tabs to green
- Chrome security limitation prevents auto-attaching debugger

---

## Issues Found

### Issue 1: Race Condition with Direct Playwright Usage
**Severity:** High  
**Description:** When using `chromium.connectOverCDP()` directly after starting relay server, the connection times out because the extension hasn't connected yet.

**Expected behavior:** Should wait for extension or provide clear error.

**Actual behavior:** Hangs until timeout, then fails with generic error.

**Suggested fix:** 
- Add connection retry with extension status check
- Or document that extension must be connected first

### Issue 2: No Token-Free Local Development Mode
**Severity:** Medium  
**Description:** CLI `serve` command requires `--token` but extension has no way to configure token.

**Workaround:** Use `startPlayWriterCDPRelayServer()` programmatically (no token required).

**Suggested fix:** Add `--no-token` flag for localhost-only usage:
```typescript
// In cli.ts
.option('--no-token', 'Allow running without authentication (localhost only)')
```

### Issue 3: Extension Must Reconnect After Server Restart
**Severity:** Medium  
**Description:** When relay server restarts, extension stays "green" but is connected to nothing. User must click icon twice (off then on) to reconnect.

**Suggested fix:** 
- Extension should detect disconnection and show visual indicator
- Or auto-reconnect when server becomes available

### Issue 4: Unclear Error Messages
**Severity:** Low  
**Description:** Error "Extension not connected" doesn't explain what user should do.

**Suggested fix:** Include actionable message:
```
Extension not connected. Please click the Playwriter extension icon on a Chrome tab to enable it.
```

### Issue 5: `/json/version` Returns Wrong WebSocket URL
**Severity:** Low  
**Description:** Returns `ws://host/cdp` without client ID, but route expects `/cdp/:clientId`.

**Current:**
```json
{"webSocketDebuggerUrl":"ws://127.0.0.1:19988/cdp"}
```

**Should be:**
```json
{"webSocketDebuggerUrl":"ws://127.0.0.1:19988/cdp/default"}
```

---

## Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Works | Primary target |
| Helium | ⚠️ Partial | Chromium-based, extension works but some quirks |
| Firefox | ❌ N/A | Extension not compatible |
| Safari | ❌ N/A | Extension not compatible |

---

## Recommended Workflow

1. **Start relay server once** (keep running):
   ```bash
   node /path/to/node_modules/playwriter/dist/start-relay-server.js
   ```

2. **Click extension icon** on a Chrome tab (turns green)

3. **Run scripts** using MCP SDK approach:
   ```bash
   bun run test-via-mcp.js
   ```

4. **Keep Chrome open** with extension green for persistent automation

---

## Files Created During Session

| File | Purpose | Status |
|------|---------|--------|
| `/home/saboor/test-via-mcp.js` | MCP SDK test | ✅ Works |
| `/home/saboor/test-final.js` | Verbose MCP test | ✅ Works |
| `/home/saboor/test-interactive.js` | Interactive wait for extension | ✅ Works |
| `/home/saboor/playwriter-browser.js` | Playwright-like wrapper | ✅ Works (minor bugs) |
| `/home/saboor/test-playwright-api.js` | Test for wrapper | ✅ Works |
| `/home/saboor/test-playwright-direct.js` | Direct Playwright test | ❌ Timing issues |
| `/home/saboor/test-minimal.js` | Minimal connection test | ❌ Times out |

---

## Code Changes Made to Repo

### Modified: `playwriter/src/cli.ts`
Added `--no-token` option for local development:
```typescript
.option('--no-token', 'Allow running without authentication (localhost only)')
```

Location: `/home/saboor/playwriter-repo/playwriter/src/cli.ts`

**Note:** This change is in the old clone at `playwriter-repo`, not the new one at `code/playwriter`.
