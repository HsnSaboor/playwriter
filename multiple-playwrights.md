---
title: Multiple Playwright Clients Architecture
description: How the CDP relay server supports multiple isolated Playwright connections
prompt: |
  Write a high-level architecture document explaining how the CDP relay server 
  was modified to support multiple Playwright clients with session isolation.
  Reference: @playwriter/src/extension/cdpRelay.ts
---

# Multiple Playwright Clients Architecture

The CDP relay server now supports multiple concurrent Playwright clients, each with isolated browser tab sessions. This enables parallel automation scenarios while maintaining session integrity.

## Overview

The relay server acts as a bridge between:
- **Multiple Playwright clients** connecting via WebSocket to `/cdp/<clientId>` 
- **One Chrome Extension** connecting via WebSocket to `/extension`
- **Multiple browser tabs** controlled through Chrome DevTools Protocol (CDP)

## Client Identification

Each Playwright client must connect with a unique identifier in the connection path:

```
ws://localhost:19988/cdp/client-123
ws://localhost:19988/cdp/automation-bot-1  
ws://localhost:19988/cdp/test-runner-42
```

If no client ID is provided in the path, the connection is rejected. This ensures every client can be uniquely identified and tracked.

## Session Ownership Model

### Tab/Session Lifecycle

1. **Initial State**: When the Chrome Extension attaches to a browser tab, it creates a CDP session that is initially **unclaimed**
2. **Claiming Ownership**: The first Playwright client to send a command to that session **claims ownership**
3. **Exclusive Access**: Once owned, only that client can send commands to that tab/session
4. **Access Denial**: Other clients receive an error if they attempt to access an owned session
5. **Release on Disconnect**: When a client disconnects, all its owned sessions become available again

### Example Flow

```
1. Extension attaches to Tab A → Session S1 created (unclaimed)
2. Client-1 sends command to S1 → Client-1 owns S1
3. Client-2 sends command to S1 → Error: "Session S1 is owned by client-1"
4. Extension attaches to Tab B → Session S2 created (unclaimed)  
5. Client-2 sends command to S2 → Client-2 owns S2
6. Client-1 disconnects → S1 becomes unclaimed
7. Client-2 can now claim S1 if needed
```

## Message Routing

### Commands (Playwright → Extension)
- Commands are tagged with the originating client ID
- Responses are routed back only to the requesting client
- Session commands validate ownership before forwarding

### Events (Extension → Playwright)
- **Session-specific events**: Routed only to the owning client
- **Target.attachedToTarget**: Broadcast to all clients (until claimed)
- **Target.detachedFromTarget**: Sent only to the owning client
- **Global events**: Broadcast to all connected clients

## Architecture Benefits

### Isolation
- Each client operates independently without interference
- Prevents accidental cross-contamination of test scenarios
- Clear ownership model prevents command conflicts

### Scalability  
- Multiple test suites can run in parallel against different tabs
- Load can be distributed across multiple automation clients
- No artificial limitation on number of concurrent clients

### Flexibility
- Clients can dynamically connect and disconnect
- Sessions can be transferred between clients (after disconnect)
- Each client can manage multiple tabs/sessions

## Implementation Details

The server maintains:
- `Map<clientId, PlaywrightClient>` - All connected Playwright clients
- `Map<sessionId, ConnectedTarget>` - All browser sessions with ownership info
- Each `PlaywrightClient` tracks its owned sessions via `Set<sessionId>`

When a command arrives with a `sessionId`, the server:
1. Checks if the session exists
2. Verifies the requesting client owns it (or claims it if unclaimed)
3. Forwards the command to the extension
4. Routes the response back to only that client

## Use Cases

### Parallel Test Execution
Multiple test runners can each control their own set of browser tabs without interference.

### Monitoring & Automation Split
One client handles user automation while another monitors performance metrics on different tabs.

### Multi-User Debugging
Multiple developers can connect their own Playwright instances to debug different parts of an application simultaneously.

## Limitations

- Each tab can only be controlled by one client at a time
- Session ownership is "sticky" - once claimed, it remains until client disconnect
- No built-in session sharing or handoff mechanism (by design, for safety)
