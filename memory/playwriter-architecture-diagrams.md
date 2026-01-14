# Playwriter Architecture Deep Dive

## Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              YOUR SYSTEM                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────────┐ │
│  │   Your Script   │     │   MCP Server    │     │      Relay Server          │ │
│  │                 │     │  (bunx playwr.) │     │   (start-relay-server.js)  │ │
│  │  - MCP Client   │────→│                 │────→│                            │ │
│  │  - SDK calls    │     │  - Tool: exec   │     │  - Hono HTTP/WS server    │ │
│  │                 │     │  - Tool: reset  │     │  - Port 19988             │ │
│  └─────────────────┘     └─────────────────┘     │  - Routes:                │ │
│         │                       │                │    /extension (WS)        │ │
│         │ stdio                 │ spawns         │    /cdp/:id (WS)          │ │
│         │ transport             │ detached       │    /json/version          │ │
│         ▼                       ▼                │    /json/list             │ │
│                                                  └────────────┬──────────────┘ │
│                                                               │                 │
│                                                    WebSocket  │                 │
│                                                    connection │                 │
│                                                               ▼                 │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                        CHROME BROWSER                                       │ │
│  │  ┌──────────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Playwriter Extension                               │  │ │
│  │  │                                                                       │  │ │
│  │  │  - Connects to ws://localhost:19988/extension                        │  │ │
│  │  │  - Uses chrome.debugger API to attach to tabs                        │  │ │
│  │  │  - Forwards CDP commands between relay server and Chrome             │  │ │
│  │  │  - Icon: Grey (disconnected) / Green (connected)                     │  │ │
│  │  │                                                                       │  │ │
│  │  └───────────────────────────────┬───────────────────────────────────────┘  │ │
│  │                                  │ chrome.debugger API                      │ │
│  │                                  ▼                                          │ │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │ │
│  │  │    Tab 1      │  │    Tab 2      │  │    Tab 3      │   ...             │ │
│  │  │  (green icon) │  │  (grey icon)  │  │  (grey icon)  │                   │ │
│  │  │               │  │               │  │               │                   │ │
│  │  │  Controlled   │  │  Not enabled  │  │  Not enabled  │                   │ │
│  │  └───────────────┘  └───────────────┘  └───────────────┘                   │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Startup Sequence (MCP Approach)

```
Time    Event                                   Component
─────   ─────────────────────────────────────   ───────────────────────
T+0     Script calls client.connect()           Your Script
T+10    MCP Server spawns via stdio             MCP Server
T+20    MCP checks if relay running             MCP Server
T+30    Relay not running, spawns detached      MCP Server
T+50    Relay server listening on :19988        Relay Server
T+60    MCP returns "connected"                 MCP Server
T+100   Log: "waiting for extension"            Relay Server
T+5000  User clicks extension icon              Extension
T+5010  Extension connects to /extension WS     Extension
T+5020  Log: "Extension connected"              Relay Server
T+5050  Extension attaches debugger to tab      Extension
T+5100  Log: "Tab attached successfully"        Relay Server
T+6000  Script calls execute tool               Your Script
T+6010  MCP connects to /cdp/:id WS             MCP Server
T+6020  Playwright Browser.getVersion           MCP Server
T+6030  Relay forwards to Extension             Relay Server
T+6040  Extension forwards to Chrome            Extension
T+6050  Chrome responds                         Chrome
T+6060  Response flows back                     All
T+6100  Commands execute successfully           Your Script
```

## Startup Sequence (Direct Playwright - FAILS)

```
Time    Event                                   Component         Status
─────   ─────────────────────────────────────   ─────────────     ──────
T+0     Script starts                           Your Script       OK
T+10    startPlayWriterCDPRelayServer()         Your Script       OK
T+50    Relay server listening (IN-PROCESS)     Relay Server      OK
T+100   chromium.connectOverCDP()               Your Script       PROBLEM
T+110   Playwright connects to WS               Playwright        OK
T+120   Playwright: Browser.getVersion          Playwright        PROBLEM
T+130   Relay: extensionWs === null             Relay Server      FAIL
T+140   Error: "Extension not connected"        Relay Server      FAIL
T+30000 Timeout                                 Your Script       FAIL
```

## WebSocket Endpoints

### `/extension` - Extension Connection
- **Purpose:** Chrome extension connects here
- **Protocol:** WebSocket
- **Messages:** CDP events, tab attach/detach notifications
- **State:** One connection per extension instance

### `/cdp/:clientId` - Playwright/CDP Client Connection  
- **Purpose:** Playwright connects here
- **Protocol:** WebSocket (CDP over WS)
- **Messages:** CDP commands (Browser.*, Page.*, etc.)
- **State:** Multiple concurrent connections supported
- **Client ID:** Random string like `abc123_1234567890`

### `/json/version` - Version Info (HTTP)
- **Returns:** `{"Browser":"Playwriter/x.x.x","Protocol-Version":"1.3",...}`

### `/json/list` - Target List (HTTP)
- **Returns:** Array of page targets with URLs and titles

## CDP Message Flow

```
┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
│Playwright│          │  Relay  │          │Extension│          │ Chrome  │
└────┬────┘          └────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │                    │
     │ CDP Command        │                    │                    │
     │ (e.g., Page.goto)  │                    │                    │
     │───────────────────→│                    │                    │
     │                    │                    │                    │
     │                    │ Forward to         │                    │
     │                    │ extension          │                    │
     │                    │───────────────────→│                    │
     │                    │                    │                    │
     │                    │                    │ chrome.debugger    │
     │                    │                    │ sendCommand        │
     │                    │                    │───────────────────→│
     │                    │                    │                    │
     │                    │                    │    Response        │
     │                    │                    │←───────────────────│
     │                    │                    │                    │
     │                    │    Response        │                    │
     │                    │←───────────────────│                    │
     │                    │                    │                    │
     │    Response        │                    │                    │
     │←───────────────────│                    │                    │
     │                    │                    │                    │
```

## Process Lifecycle Comparison

### MCP Approach (Persistent)

```
Process Tree:
├── Your Script (exits when done)
│   └── bunx playwriter (MCP Server - exits when script exits)
│       └── start-relay-server.js (DETACHED - survives parent exit)
│
└── Chrome (separate process tree)
    └── Extension (connects to relay server)
```

### Direct Approach (Non-Persistent)

```
Process Tree:
├── Your Script (contains everything)
│   ├── Relay Server (Hono, IN-PROCESS)
│   └── Playwright connection
│
└── Chrome (separate process tree)
    └── Extension (may or may not be connected)
```

## Key Code Locations

### Relay Server Core
- `playwriter/src/cdp-relay.ts` - WebSocket routing, CDP forwarding
- `playwriter/src/start-relay-server.ts` - Standalone server entry point

### MCP Server
- `playwriter/src/mcp.ts` - Tool handlers, connection management
- `ensureRelayServer()` - Spawns detached relay server
- `ensureConnection()` - Ensures extension is connected before commands

### Extension
- `extension/lib/background.mjs` - Main extension logic
- Connects to `ws://localhost:19988/extension`
- Uses `chrome.debugger.attach()` to control tabs

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PLAYWRITER_AUTO_ENABLE` | Auto-create tab when connecting | `undefined` |
| `PLAYWRITER_TOKEN` | Auth token for CLI serve command | `undefined` |
| `PLAYWRITER_DEBUG` | Enable debug logging | `undefined` |
