---
title: Limitations & Workarounds
description: What works, what doesn't, and how to work around it
---

# Limitations & Workarounds

While Playwriter achieves ~97% compatibility with the Playwright API, the architecture (controlling an existing browser via extension) imposes some inherent limitations compared to launching a fresh headless browser.

## Unsupported APIs

### 1. Permissions (`context.grantPermissions`)

**Status:** ❌ Not Supported
**Reason:** The `Browser.grantPermissions` CDP command is not exposed to Chrome Extensions for security reasons.

**Workaround:** 
- Configure permissions manually in your Chrome profile (they persist!).
- Use `page.evaluate()` to check permission states.

```typescript
// Fails
await context.grantPermissions(['geolocation'])

// Workaround: Manually set permission in Chrome Site Settings once
```

### 2. CDPSession at Context Level (`context.newCDPSession`)

**Status:** ❌ Not Supported
**Reason:** Requires `Target.attachToBrowserTarget` which is restricted.

**Workaround:** 
Use `page.newCDPSession()` (Page-level CDP) instead. Most automation tasks can be done at the page level.

```typescript
// Fails
const client = await context.newCDPSession(page)

// Works (via internal mechanisms or creating logic to use page.evaluate)
// Playwriter focuses on standard Playwright APIs rather than raw CDP
```

### 3. Closing the Browser (`browser.close`)

**Status:** ⚠️ Dangerous
**Reason:** Calling `browser.close()` sends a command to close the actual Chrome instance. This will kill your personal browsing session.

**Recommendation:**
Never call `browser.close()`. Just let your Node.js process exit, or call `page.close()` if you want to close specific tabs.

## Edge Cases

### Multiple Contexts

Playwriter maps your existing Chrome profile to `browser.contexts()[0]`. Creating new contexts (`browser.newContext()`) works but they are virtualized within the same Chrome instance (Incognito mode is not programmatically triggerable via extension CDP in the same way).

### Downloads

Downloads are handled by your Chrome browser's default download behavior. 
- `page.waitForEvent('download')` **works**.
- But saving files might behave differently depending on your Chrome settings (e.g., if "Ask where to save each file" is on).

### PDF Generation

`page.pdf()` only works in Headless mode. Since Playwriter connects to a regular (headed) Chrome, PDF generation might fail or behave unexpectedly unless you are running Chrome with specific flags.

**Workaround:** Use `page.screenshot({ fullPage: true })` instead for visual captures.
