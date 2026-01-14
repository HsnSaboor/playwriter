---
title: Cookies & Network
description: Handling cookies and network interception with Playwriter
---

# Cookies & Network Interception

Playwriter enables powerful network and cookie management, but there are some architectural differences from standard Playwright due to how Chrome Extensions interact with the DevTools Protocol (CDP).

## Cookies

Standard Playwright uses `Storage.getCookies` and `Storage.setCookies` at the **Browser** level. Chrome Extensions via `chrome.debugger` do not have access to Browser-level Storage domains.

**The Solution:** Playwriter implements a smart workaround by intercepting these commands and redirecting them to `Network.getCookies` and `Network.setCookies` at the **Page** level.

### Supported Cookie APIs

All standard Playwright cookie methods work seamlessly:

```typescript
// Get all cookies for the current context (page)
const cookies = await context.cookies()

// Add new cookies
await context.addCookies([{
  name: 'session_id',
  value: 'xyz123',
  domain: '.github.com',
  path: '/'
}])

// Get storage state (cookies + origins)
const state = await context.storageState()

// Clear cookies
await context.clearCookies()
```

### Limitations

- **Page-Level Scope:** Unlike standard Playwright which can see global browser cookies, Playwriter sees cookies relevant to the **active page's context**.
- **No Global Browser Storage:** You cannot access cookies for domains completely unrelated to the current tabs.

## Network Interception

Playwriter supports full network interception, allowing you to mock APIs, modify headers, or block resources.

```typescript
// Mock an API endpoint
await page.route('**/api/users', route => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 1, name: 'Test User' }])
  })
})

// Abort image loading to save bandwidth
await page.route('**/*.{png,jpg,jpeg}', route => route.abort())
```

### Event Listeners

You can listen to all network traffic:

```typescript
page.on('request', request => 
  console.log('>>', request.method(), request.url()))

page.on('response', response => 
  console.log('<<', response.status(), response.url()))
```

## Special Cases

### Cookie Values with Special Characters

Standard Playwright is strict about cookie specs. If you need to set cookies with characters like `;` or `=`, ensure they are URL encoded if the standard `addCookies` method fails.

```typescript
// Good practice for complex values
await context.addCookies([{
  name: 'complex_cookie',
  value: encodeURIComponent('val=ue;other=data'),
  domain: 'example.com',
  path: '/'
}])
```
