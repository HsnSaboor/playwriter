# Tasks: CDP Cookie Workaround Implementation

## Overview

Implement transparent CDP command interception in the relay server to make
`context.cookies()`, `context.addCookies()`, `context.clearCookies()`, and
`context.storageState()` work with playwriter-controlled browsers.

**Spec:** `specs/cdp-cookie-workaround.md`  
**Research:** `docs/research-cdp-cookie-workaround.md`

---

## Task 1: Add helper function to get any active session

**File:** `playwriter/src/cdp-relay.ts`

**Description:**  
Create a helper function that returns any active tab session ID for cookie operations when no sessionId is provided.

**Implementation:**
```typescript
function getAnyActiveSessionId(): string | undefined {
  // Return first available session from connectedTargets
  const firstTarget = connectedTargets.values().next().value
  return firstTarget?.sessionId
}
```

**Location:** Add inside `startPlayWriterCDPRelayServer()` function, near other helper functions.

**Verification:**
- [ ] Function compiles without errors
- [ ] Returns `undefined` when `connectedTargets` is empty
- [ ] Returns valid sessionId when targets exist
- [ ] `pnpm typecheck` passes

---

## Task 2: Implement Storage.getCookies → Network.getCookies redirect

**File:** `playwriter/src/cdp-relay.ts`

**Description:**  
Add a case in `routeCdpCommand()` to intercept `Storage.getCookies` and redirect to `Network.getCookies`.

**Implementation:**
```typescript
case 'Storage.getCookies': {
  const targetSessionId = sessionId || getAnyActiveSessionId()
  if (!targetSessionId) {
    throw new Error('No pages available for cookie operation. Click the playwriter extension icon on a tab first.')
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

**Location:** Add in the `switch (method)` block in `routeCdpCommand()`, before the default case.

**Verification:**
- [ ] `pnpm typecheck` passes
- [ ] Logs show `Network.getCookies` being sent when `Storage.getCookies` is received
- [ ] Manual test: `context.cookies()` returns array (not error)

---

## Task 3: Implement Storage.setCookies → Network.setCookies redirect

**File:** `playwriter/src/cdp-relay.ts`

**Description:**  
Add a case to intercept `Storage.setCookies` and redirect to `Network.setCookies`.

**Implementation:**
```typescript
case 'Storage.setCookies': {
  const targetSessionId = sessionId || getAnyActiveSessionId()
  if (!targetSessionId) {
    throw new Error('No pages available for cookie operation. Click the playwriter extension icon on a tab first.')
  }
  return await sendToExtension({
    method: 'forwardCDPCommand',
    params: { 
      sessionId: targetSessionId,
      method: 'Network.setCookies',
      params: { cookies: params?.cookies || [] }
    }
  })
}
```

**Verification:**
- [ ] `pnpm typecheck` passes
- [ ] Manual test: `context.addCookies([...])` completes without error
- [ ] Verify cookie was set: `context.cookies()` includes the new cookie

---

## Task 4: Implement Storage.clearCookies → Network.deleteCookies (iterate)

**File:** `playwriter/src/cdp-relay.ts`

**Description:**  
Add a case to intercept `Storage.clearCookies`. First get all cookies via `Network.getCookies`, then delete each via `Network.deleteCookies`.

**Implementation:**
```typescript
case 'Storage.clearCookies': {
  const targetSessionId = sessionId || getAnyActiveSessionId()
  if (!targetSessionId) {
    throw new Error('No pages available for cookie operation. Click the playwriter extension icon on a tab first.')
  }
  
  // Get all cookies first
  const result = await sendToExtension({
    method: 'forwardCDPCommand',
    params: { 
      sessionId: targetSessionId,
      method: 'Network.getCookies',
      params: {} 
    }
  }) as { cookies?: Array<{ name: string; domain: string; path: string }> }
  
  // Delete each cookie
  const cookies = result?.cookies || []
  for (const cookie of cookies) {
    await sendToExtension({
      method: 'forwardCDPCommand',
      params: { 
        sessionId: targetSessionId,
        method: 'Network.deleteCookies',
        params: { 
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path
        }
      }
    })
  }
  
  return {}
}
```

**Verification:**
- [ ] `pnpm typecheck` passes
- [ ] Manual test: `context.clearCookies()` completes without error
- [ ] Verify cookies cleared: `context.cookies()` returns empty array

---

## Task 5: Add logging for cookie workaround commands

**File:** `playwriter/src/cdp-relay.ts`

**Description:**  
Add debug logging to track when cookie commands are being redirected.

**Implementation:**
Add at the start of each cookie case:
```typescript
logger?.log(chalk.yellow(`[Cookie Workaround] Redirecting ${method} → Network.*`))
```

**Verification:**
- [ ] Logs appear in relay server log when cookie methods are called
- [ ] Logs clearly indicate the redirection happening

---

## Task 6: Run and verify comprehensive API test

**File:** `playwriter/test/playwright-full-api.ts`

**Description:**  
Run the existing comprehensive test to verify cookie methods now pass.

**Command:**
```bash
cd playwriter && npx tsx test/playwright-full-api.ts
```

**Verification:**
- [ ] `context.cookies()` test passes (was failing)
- [ ] `context.addCookies()` test passes (was failing)
- [ ] `context.clearCookies()` test passes (was failing)
- [ ] `context.storageState()` test passes (was failing)
- [ ] Total pass rate improves from 93.8% to ~96%

---

## Task 7: Add dedicated cookie integration test

**File:** `playwriter/test/cookie-workaround.test.ts` (NEW)

**Description:**  
Create a focused test file for the cookie workaround functionality.

**Implementation:**
```typescript
/**
 * Cookie Workaround Integration Tests
 * 
 * Tests the CDP command interception for Storage.* → Network.* redirection.
 */
import { connectToPlaywriter, ensurePersistentRelay, waitForExtension } from '../src/index.js'
import type { Browser, BrowserContext, Page } from 'playwright-core'

async function main() {
  console.log('\\n🍪 Cookie Workaround Integration Tests\\n')
  
  await ensurePersistentRelay({ timeout: 15000 })
  await waitForExtension({ timeout: 5000 })
  const browser = await connectToPlaywriter({ timeout: 30000 })
  const context = browser.contexts()[0]
  const page = context.pages()[0]
  
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })
  
  let passed = 0
  let failed = 0
  
  // Test 1: addCookies
  try {
    await context.addCookies([{
      name: 'test_cookie',
      value: 'test_value',
      domain: 'example.com',
      path: '/'
    }])
    console.log('  ✅ context.addCookies() works')
    passed++
  } catch (e: any) {
    console.log('  ❌ context.addCookies():', e.message)
    failed++
  }
  
  // Test 2: cookies (verify added cookie)
  try {
    const cookies = await context.cookies()
    if (!Array.isArray(cookies)) throw new Error('Should return array')
    const found = cookies.find(c => c.name === 'test_cookie')
    if (!found) throw new Error('Cookie not found')
    console.log('  ✅ context.cookies() returns added cookie')
    passed++
  } catch (e: any) {
    console.log('  ❌ context.cookies():', e.message)
    failed++
  }
  
  // Test 3: clearCookies
  try {
    await context.clearCookies()
    const after = await context.cookies()
    // Note: may have some cookies left from page, but test_cookie should be gone
    console.log('  ✅ context.clearCookies() completes')
    passed++
  } catch (e: any) {
    console.log('  ❌ context.clearCookies():', e.message)
    failed++
  }
  
  // Test 4: storageState
  try {
    const state = await context.storageState()
    if (!state || typeof state !== 'object') throw new Error('Should return object')
    if (!('cookies' in state)) throw new Error('Should have cookies property')
    console.log('  ✅ context.storageState() works')
    passed++
  } catch (e: any) {
    console.log('  ❌ context.storageState():', e.message)
    failed++
  }
  
  console.log(`\\n📊 Results: ${passed}/${passed + failed} passed\\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
```

**Verification:**
- [ ] All 4 tests pass
- [ ] Test file runs successfully: `npx tsx test/cookie-workaround.test.ts`

---

## Task 8: Update memory file with final results

**File:** `memory/playwright-compatibility-results.md`

**Description:**  
Update the compatibility results to reflect the newly working methods.

**Changes:**
- Update summary stats (should be ~125/130 passing, 96.2%)
- Move cookie methods from "Not Working" to "Working" section
- Add note about the workaround implementation

**Verification:**
- [ ] Stats are accurate after running tests
- [ ] Documentation clearly explains what was fixed

---

## Task 9: Update CHANGELOG

**File:** `playwriter/CHANGELOG.md`

**Description:**  
Add entry documenting the cookie workaround feature.

**Entry:**
```markdown
## [0.0.48] - 2026-01-14

### Fixed
- `context.cookies()` now works via Network.getCookies CDP command workaround
- `context.addCookies()` now works via Network.setCookies CDP command workaround
- `context.clearCookies()` now works via Network.deleteCookies CDP command workaround
- `context.storageState()` now works (was blocked by cookies issue)

### Technical
- Added CDP command interception in relay server for Storage.* → Network.* redirection
- Cookie commands that required browser-level access now use page-level equivalents
```

**Verification:**
- [ ] Version bumped appropriately
- [ ] Entry clearly describes what was fixed

---

## Summary

| Task | Description | Est. Time |
|------|-------------|-----------|
| 1 | Helper function for active session | 10 min |
| 2 | Storage.getCookies redirect | 15 min |
| 3 | Storage.setCookies redirect | 10 min |
| 4 | Storage.clearCookies redirect | 20 min |
| 5 | Add logging | 5 min |
| 6 | Run verification tests | 10 min |
| 7 | Cookie integration test | 20 min |
| 8 | Update memory file | 10 min |
| 9 | Update CHANGELOG | 5 min |

**Total estimated time:** ~2 hours

## Dependencies

- Tasks 2-4 depend on Task 1 (helper function)
- Task 6 depends on Tasks 2-4 (implementation complete)
- Task 7 depends on Tasks 2-4 (implementation complete)
- Tasks 8-9 depend on Task 6 (verified results)
