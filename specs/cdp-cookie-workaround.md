# CDP Cookie Workaround Specification

## Problem Statement

Playwriter's CDP relay works at the **page/tab level** via Chrome's `chrome.debugger` API, not at the browser level. This causes 7 Playwright context-level methods to fail:

| Method | CDP Command Used | Error |
|--------|------------------|-------|
| `context.cookies()` | `Storage.getCookies` | "No tab found for method Storage.getCookies" |
| `context.addCookies()` | `Storage.setCookies` | "No tab found for method Storage.setCookies" |
| `context.clearCookies()` | `Storage.getCookies` | "No tab found for method Storage.getCookies" |
| `context.storageState()` | `Storage.getCookies` | "No tab found for method Storage.getCookies" |
| `context.grantPermissions()` | `Browser.grantPermissions` | "No tab found for method Browser.grantPermissions" |
| `context.clearPermissions()` | `Browser.resetPermissions` | "No tab found for method Browser.resetPermissions" |
| `context.newCDPSession()` | `Target.attachToBrowserTarget` | "No tab found for method Target.attachToBrowserTarget" |

### Root Cause

The Chrome extension uses `chrome.debugger.attach({ tabId })` which only provides page-level CDP access. The `Storage.*` CDP commands require `browserContextId` parameter for browser-level access, which is not available through the tab-level debugger API.

## Proposed Solution

### Implementable Workarounds (Cookie Methods)

The `Network` CDP domain provides equivalent cookie functionality that works at page-level:

| Storage Command | Network Equivalent | Page-Level Compatible |
|-----------------|--------------------|-----------------------|
| `Storage.getCookies` | `Network.getCookies` | ✅ Yes |
| `Storage.setCookies` | `Network.setCookies` | ✅ Yes |
| `Storage.clearCookies` | `Network.deleteCookies` | ✅ Yes (per-cookie) |

### Strategy: CDP Command Interception

Intercept `Storage.*` cookie commands in the relay server and redirect to equivalent `Network.*` commands:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Playwright    │────│  CDP Relay      │────│   Extension     │
│                 │    │  (intercept)    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                      │                      │
        │ Storage.getCookies   │ Network.getCookies   │
        │ ─────────────────────│──────────────────────│
        │                      │ (redirected)         │
```

### Not Implementable (Permission Methods)

The following methods **cannot** be fixed without browser-level access:

| Method | Reason |
|--------|--------|
| `context.grantPermissions()` | `Browser.grantPermissions` has no page-level equivalent |
| `context.clearPermissions()` | `Browser.resetPermissions` has no page-level equivalent |
| `context.newCDPSession()` at browser level | `Target.attachToBrowserTarget` requires browser target |

These remain as documented limitations.

## Technical Design

### CDP Command Mapping

#### 1. `Storage.getCookies` → `Network.getCookies`

**Input (Storage):**
```typescript
{
  browserContextId?: string  // Ignored - not available
}
```

**Output (Network):**
```typescript
{
  urls?: string[]  // Optional - returns cookies for current page if omitted
}
```

**Response mapping:**
Both return `{ cookies: Network.Cookie[] }` - format is identical.

#### 2. `Storage.setCookies` → `Network.setCookies`

**Input (Storage):**
```typescript
{
  cookies: Network.CookieParam[]
  browserContextId?: string  // Ignored
}
```

**Mapping:** Direct passthrough - same parameter format.

#### 3. `Storage.clearCookies` → Multiple `Network.deleteCookies`

**Strategy:**
1. First call `Network.getCookies` to get all cookies
2. For each cookie, call `Network.deleteCookies` with name/domain/path

**Note:** This is less efficient but maintains API compatibility.

### Implementation Location

Modify `playwriter/src/cdp-relay.ts` in the `routeCdpCommand()` function:

```typescript
async function routeCdpCommand({ method, params, sessionId }) {
  switch (method) {
    // Existing cases...
    
    // NEW: Cookie workaround cases
    case 'Storage.getCookies': {
      // Redirect to Network.getCookies
      return await sendToExtension({
        method: 'forwardCDPCommand',
        params: { sessionId, method: 'Network.getCookies', params: {} }
      })
    }
    
    case 'Storage.setCookies': {
      // Redirect to Network.setCookies
      return await sendToExtension({
        method: 'forwardCDPCommand',
        params: { sessionId, method: 'Network.setCookies', params }
      })
    }
    
    case 'Storage.clearCookies': {
      // Get cookies first, then delete each
      const result = await sendToExtension({
        method: 'forwardCDPCommand',
        params: { sessionId, method: 'Network.getCookies', params: {} }
      })
      for (const cookie of result.cookies) {
        await sendToExtension({
          method: 'forwardCDPCommand',
          params: { 
            sessionId, 
            method: 'Network.deleteCookies', 
            params: { name: cookie.name, domain: cookie.domain, path: cookie.path }
          }
        })
      }
      return {}
    }
    
    // Default: forward to extension
    default:
      return await sendToExtension({...})
  }
}
```

### Session ID Handling

The cookie commands need to be sent to a valid tab session. Logic:

1. If `sessionId` is provided, use it
2. If not, find any active tab session from the extension state
3. If no tabs, throw descriptive error

### storageState() Support

`context.storageState()` combines:
1. Cookies (via `Storage.getCookies`) - ✅ Fixed by this workaround
2. localStorage (via `Runtime.evaluate`) - ✅ Already works
3. sessionStorage (via `Runtime.evaluate`) - ✅ Already works

With the cookie workaround, `storageState()` should work automatically.

## Testing Strategy

### Unit Tests

Add test cases to `playwriter/test/playwright-full-api.ts`:

```typescript
// These should now pass after the workaround
await test('Context', 'context.cookies()', 'context.cookies', async () => {
  const c = await context.cookies()
  if (!Array.isArray(c)) throw new Error('Should return array')
})

await test('Context', 'context.addCookies()', 'context.addCookies', async () => {
  await context.addCookies([{ 
    name: 'test', 
    value: 'val', 
    domain: 'example.com', 
    path: '/' 
  }])
})

await test('Context', 'context.clearCookies()', 'context.clearCookies', async () => {
  await context.clearCookies()
})

await test('Context', 'context.storageState()', 'context.storageState', async () => {
  const state = await context.storageState()
  if (!state) throw new Error('Should return state')
})
```

### Integration Tests

Verify end-to-end cookie lifecycle:

```typescript
// Set a cookie
await context.addCookies([{
  name: 'session',
  value: '12345',
  domain: '.example.com',
  path: '/'
}])

// Verify it exists
const cookies = await context.cookies()
expect(cookies.find(c => c.name === 'session')).toBeDefined()

// Clear and verify
await context.clearCookies()
const after = await context.cookies()
expect(after.length).toBe(0)
```

## Success Criteria

After implementation:

| Test | Before | After |
|------|--------|-------|
| `context.cookies()` | ❌ Fail | ✅ Pass |
| `context.addCookies()` | ❌ Fail | ✅ Pass |
| `context.clearCookies()` | ❌ Fail | ✅ Pass |
| `context.storageState()` | ❌ Fail | ✅ Pass |
| Total passing | 121/130 (93.8%) | 125/130 (96.2%) |

## Limitations

### Still Not Working

These methods remain unsupported (no workaround possible):

| Method | Reason |
|--------|--------|
| `context.grantPermissions()` | Requires browser-level CDP |
| `context.clearPermissions()` | Requires browser-level CDP |
| `context.newCDPSession()` (browser) | Requires browser target |

### Cookie Scope Differences

| Aspect | Browser-level | Page-level (workaround) |
|--------|---------------|-------------------------|
| Cross-origin cookies | All cookies | Only current page URLs |
| HttpOnly cookies | ✅ Accessible | ✅ Accessible |
| Secure cookies | ✅ Accessible | ✅ Accessible |
| Partition keys | ✅ Supported | ⚠️ May vary |

The workaround returns cookies applicable to the current page context, which is typically sufficient for most automation scenarios.

## References

- [CDP Storage Domain](https://chromedevtools.github.io/devtools-protocol/tot/Storage/)
- [CDP Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Chrome Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
