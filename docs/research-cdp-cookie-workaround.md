# Research: CDP Cookie Workaround Implementation

## Date: 2026-01-14

## Summary

This document contains research findings for implementing transparent CDP cookie command workarounds in playwriter's relay server. The goal is to redirect browser-level `Storage.*` commands to page-level `Network.*` equivalents.

---

## 1. Problem Analysis

### Current Failure Mode

When Playwright calls `context.cookies()`, it sends `Storage.getCookies` with `browserContextId` parameter. This fails in playwriter because:

1. Chrome extension uses `chrome.debugger.attach({ tabId })` - page-level only
2. `Storage.getCookies` requires browser-level CDP access
3. Extension relay has no access to `browserContextId` concept

### Error Message
```
browserContext.cookies: Protocol error (Storage.getCookies): No tab found for method Storage.getCookies
```

---

## 2. Playwright Source Code Analysis

### How Playwright Implements Cookies

From `playwright/packages/playwright-core/src/server/chromium/crBrowser.ts`:

```typescript
// Line 367-385: doGetCookies implementation
async doGetCookies(urls: string[]): Promise<channels.NetworkCookie[]> {
  const { cookies } = await this._browser._session.send('Storage.getCookies', {
    browserContextId: this._browserContextId
  });
  return network.filterCookies(cookies.map(c => {
    const { name, value, domain, path, expires, httpOnly, secure, sameSite } = c;
    const copy: channels.NetworkCookie = {
      name, value, domain, path, expires, httpOnly, secure,
      sameSite: sameSite ?? 'Lax',
    };
    if (c.partitionKey) {
      copy._crHasCrossSiteAncestor = c.partitionKey.hasCrossSiteAncestor;
      copy.partitionKey = c.partitionKey.topLevelSite;
    }
    return copy;
  }), urls);
}
```

### Key Insights

1. **Playwright uses `Storage.getCookies`** with `browserContextId` parameter
2. **Cookie format** is `Protocol.Network.Cookie` - same as Network domain
3. **Partition keys** are supported for partitioned cookies
4. **URL filtering** is done client-side by Playwright

---

## 3. CDP Domain Comparison

### Storage Domain (Browser-Level)

```
Storage.getCookies
├── Parameters:
│   └── browserContextId (optional) - Browser context ID
└── Returns:
    └── cookies: Network.Cookie[]

Storage.setCookies
├── Parameters:
│   ├── cookies: Network.CookieParam[]
│   └── browserContextId (optional)
└── Returns: (void)

Storage.clearCookies
├── Parameters:
│   └── browserContextId (optional)
└── Returns: (void)
```

### Network Domain (Page-Level)

```
Network.getCookies
├── Parameters:
│   └── urls: string[] (optional) - URLs to get cookies for
└── Returns:
    └── cookies: Network.Cookie[]

Network.setCookies
├── Parameters:
│   └── cookies: Network.CookieParam[]
└── Returns: (void)

Network.deleteCookies
├── Parameters:
│   ├── name: string (required)
│   ├── url: string (optional)
│   ├── domain: string (optional)
│   ├── path: string (optional)
│   └── partitionKey: CookiePartitionKey (optional)
└── Returns: (void)
```

### Format Compatibility

| Field | Storage.Cookie | Network.Cookie | Compatible |
|-------|----------------|----------------|------------|
| name | ✅ | ✅ | ✅ Same |
| value | ✅ | ✅ | ✅ Same |
| domain | ✅ | ✅ | ✅ Same |
| path | ✅ | ✅ | ✅ Same |
| expires | ✅ | ✅ | ✅ Same |
| httpOnly | ✅ | ✅ | ✅ Same |
| secure | ✅ | ✅ | ✅ Same |
| sameSite | ✅ | ✅ | ✅ Same |
| partitionKey | ✅ | ✅ | ✅ Same |

**Conclusion:** Cookie format is identical between domains.

---

## 4. Implementation Strategy

### 4.1 Storage.getCookies → Network.getCookies

**Mapping:**
```typescript
// Incoming (from Playwright)
{
  method: 'Storage.getCookies',
  params: { browserContextId?: string }
}

// Outgoing (to extension)
{
  method: 'Network.getCookies',
  params: { urls?: string[] }  // Can be empty for all cookies
}
```

**Notes:**
- `Network.getCookies` without `urls` returns all cookies accessible to the page
- Playwright does URL filtering client-side, so this is compatible

### 4.2 Storage.setCookies → Network.setCookies

**Mapping:**
```typescript
// Incoming
{
  method: 'Storage.setCookies',
  params: { 
    cookies: Network.CookieParam[],
    browserContextId?: string 
  }
}

// Outgoing
{
  method: 'Network.setCookies',
  params: { 
    cookies: Network.CookieParam[]  // Same format
  }
}
```

**Notes:**
- Cookie parameter format is identical
- Simply strip `browserContextId` and forward

### 4.3 Storage.clearCookies → Network.deleteCookies (iterate)

**Strategy:**
```typescript
// Step 1: Get all cookies
const { cookies } = await send('Network.getCookies', {})

// Step 2: Delete each cookie
for (const cookie of cookies) {
  await send('Network.deleteCookies', {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
    partitionKey: cookie.partitionKey
  })
}
```

**Notes:**
- No direct `Network.clearCookies` equivalent
- Must iterate and delete individually
- Performance impact for many cookies, but typically acceptable

---

## 5. Session ID Handling

### Problem

Cookie commands need to be routed to a valid page session. Without `sessionId`, the extension doesn't know which tab to target.

### Solution

Find any active tab session from extension state:

```typescript
case 'Storage.getCookies': {
  // Find a session to use
  let targetSessionId = sessionId
  if (!targetSessionId) {
    // Get any active page session from extension state
    const status = await getExtensionStatus()
    if (status.pages.length === 0) {
      throw new Error('No pages available for cookie operation')
    }
    // Use first available page's session
    targetSessionId = status.pages[0].sessionId
  }
  
  return await sendToExtension({
    method: 'forwardCDPCommand',
    params: { 
      sessionId: targetSessionId,
      method: 'Network.getCookies',
      params: {}
    }
  })
}
```

---

## 6. Edge Cases

### 6.1 Cross-Origin Cookies

| Scenario | Storage (browser-level) | Network (page-level) |
|----------|-------------------------|----------------------|
| Same-origin cookies | ✅ All returned | ✅ All returned |
| Cross-origin (3P) | ✅ All returned | ⚠️ Only if URL specified |
| HttpOnly | ✅ Accessible | ✅ Accessible |
| Secure | ✅ Accessible | ✅ Accessible |

**Mitigation:** For most automation use cases, page-scoped cookies are sufficient.

### 6.2 No Active Pages

If no pages are connected when cookie command arrives:

```typescript
throw new RelayServerError(
  'No pages available. Click the playwriter extension icon on a tab first.',
  this.port
)
```

### 6.3 Partitioned Cookies (CHIPS)

Both domains support partition keys with same format:

```typescript
partitionKey: {
  topLevelSite: string,
  hasCrossSiteAncestor: boolean
}
```

Should work transparently.

---

## 7. Testing Plan

### Unit Tests

```typescript
// Test cookie lifecycle
test('context.cookies() returns cookies', async () => {
  await context.addCookies([{
    name: 'test',
    value: 'value',
    domain: 'example.com',
    path: '/'
  }])
  
  const cookies = await context.cookies()
  expect(cookies.find(c => c.name === 'test')).toBeDefined()
})

test('context.clearCookies() removes all cookies', async () => {
  await context.addCookies([...])
  await context.clearCookies()
  
  const cookies = await context.cookies()
  expect(cookies.length).toBe(0)
})

test('context.storageState() includes cookies', async () => {
  await context.addCookies([...])
  const state = await context.storageState()
  
  expect(state.cookies).toBeDefined()
  expect(Array.isArray(state.cookies)).toBe(true)
})
```

### Integration Tests

Verify with real page navigation:

```typescript
test('cookies persist across navigation', async () => {
  await page.goto('https://example.com')
  await context.addCookies([{ name: 's', value: '1', domain: '.example.com', path: '/' }])
  
  await page.reload()
  
  const cookies = await context.cookies()
  expect(cookies.find(c => c.name === 's')).toBeDefined()
})
```

---

## 8. References

- [CDP Storage Domain](https://chromedevtools.github.io/devtools-protocol/tot/Storage/)
- [CDP Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Playwright crBrowser.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crBrowser.ts)
- [Chrome Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Puppeteer Cookie Management](https://pptr.dev/guides/cookies)
