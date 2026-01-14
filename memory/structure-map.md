# Playwriter Structure Map

## Key Components

### Extension (`extension/`)
- **background.ts** - Main service worker, handles:
  - `ConnectionManager` class - WebSocket connection to relay server
  - `attachTab()` / `detachTab()` - Chrome debugger attachment
  - `connectTab()` / `disconnectTab()` - Tab connection lifecycle
  - `handleCommand()` - CDP command routing
  - `syncTabGroup()` - Tab group management
  - Tab creation: `chrome.tabs.create()` (lines 135, 566, 1085)
  - No `chrome.windows` API usage currently

### Relay Server (`playwriter/src/`)
- **cdp-relay.ts** - WebSocket server bridging extension <-> Playwright
- **mcp.ts** - MCP server implementation
- **index.ts** - Public API exports

## Current Tab Creation Flow
1. `createInitialTab` message → `chrome.tabs.create({ url: 'about:blank', active: false })`
2. `Target.createTarget` CDP command → `chrome.tabs.create({ url, active: false })`
3. New tabs created in **current window** (no windowId specified)

## Chrome APIs Used
- `chrome.tabs.*` - Tab management (create, remove, query, group)
- `chrome.tabGroups.*` - Tab grouping ("playwriter" group)
- `chrome.debugger.*` - CDP attachment
- `chrome.windows.*` - **NOT USED** currently

## Architecture Notes
- Extension connects to relay server on `ws://localhost:19988/extension`
- Playwright clients connect to `ws://localhost:19988/cdp/:clientId`
- Tabs tracked via `store` (zustand) with sessionId/targetId mapping
