# Playwriter Quick Reference

## Working Approaches

### 1. MCP SDK (RECOMMENDED)
```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'test', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: 'bunx',
  args: ['playwriter'],
})
await client.connect(transport)

await client.callTool({
  name: 'execute',
  arguments: { code: 'await page.goto("https://example.com")' }
})
```

### 2. Direct Playwright (requires persistent relay)
```bash
# Terminal 1: Start relay server persistently
node /path/to/node_modules/playwriter/dist/start-relay-server.js

# Click extension icon in Chrome (must be green)

# Terminal 2: Run your script
bun run your-script.js
```

```javascript
import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:19988')
```

## Key Commands

```bash
# Kill stuck relay server
lsof -ti:19988 | xargs -r kill -9

# Check relay status
curl http://127.0.0.1:19988/json/version

# View relay logs
cat /tmp/playwriter/relay-server.log | tail -20

# Check extension connected
grep "Extension connected" /tmp/playwriter/relay-server.log
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Extension not connected` | Extension icon not clicked | Click extension icon after relay starts |
| `Timeout exceeded` | Race condition | Use MCP approach or wait for extension |
| `Port 19988 in use` | Old process running | `lsof -ti:19988 \| xargs kill -9` |

## Working Test Files

- `/home/saboor/test-via-mcp.js` - MCP approach (works)
- `/home/saboor/test-final.js` - MCP with verbose output
- `/home/saboor/playwriter-browser.js` - Playwright-like wrapper
