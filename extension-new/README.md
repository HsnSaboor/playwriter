# Extension New - Rewritten CDP Relay Server

Clean, simple rewrite of the CDP relay server using Hono WebSocket.

## Architecture

The relay server acts as a bridge between:
- **Playwright** (connects via `/cdp`) - Controls the browser  
- **Chrome Extension** (connects via `/extension`) - Provides chrome.debugger access

### Message Flow

```
Playwright → /cdp → Router → /extension → Extension → chrome.debugger → Tab
Tab → chrome.debugger → Extension → /extension → /cdp → Playwright
```

## Implementation

**Everything inlined in one file** - No abstraction layers, just straightforward code.

### Files

**`relay-server.ts`** - Single file with everything:
- Two WebSocket endpoints (`/cdp` and `/extension`)
- Connection lifecycle management
- CDP command routing (Browser.*, Target.*, etc)
- Extension request/response handling
- Target registry (simple Map)
- All message forwarding logic

**`protocol.ts`** - Message type definitions

**`index.ts`** - Exports
**`example.ts`** - Usage example

## Key Improvements

**Simpler Code:**
- Everything in one place
- No helper functions or modules
- Clear linear flow
- All state as local variables

**Better Logging:**
- Only logs connection events, CDP messages, and errors
- No verbose debug noise

**Clean API:**

```typescript
const server = await startRelayServer({ port: 19988 })

// Returns:
// {
//   cdpEndpoint: 'ws://localhost:19988/cdp',
//   extensionEndpoint: 'ws://localhost:19988/extension',
//   close: () => void
// }

// Cleanup:
server.close()
```

## Usage

```typescript
import { startRelayServer } from './relay-server.js'

const server = await startRelayServer({ port: 19988 })

console.log('Extension endpoint:', server.extensionEndpoint)
console.log('CDP endpoint:', server.cdpEndpoint)

// Later:
server.close()
```

## Running Example

```bash
pnpm install
pnpm build
node dist/example.js
```
