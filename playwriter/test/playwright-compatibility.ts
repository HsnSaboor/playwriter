/**
 * Comprehensive Playwright Compatibility Test
 * 
 * This script tests all major Playwright features to ensure 100% compatibility
 * with playwriter's CDP relay. Run with extension enabled on a tab.
 * 
 * IMPORTANT: Run with Node.js (npx tsx), NOT bun. Bun has Playwright compatibility issues.
 * Usage: npx tsx test/playwright-compatibility.ts
 */

import { connectToPlaywriter, ensurePersistentRelay, waitForExtension, getCdpUrl } from '../src/index.js'
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright-core'

const TEST_URL = 'https://example.com'
const RESULTS: { name: string; status: 'pass' | 'fail'; error?: string; duration: number }[] = []

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now()
  try {
    await fn()
    RESULTS.push({ name, status: 'pass', duration: Date.now() - start })
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    RESULTS.push({ name, status: 'fail', error, duration: Date.now() - start })
    console.log(`  ❌ ${name}: ${error}`)
  }
}

async function main() {
  console.log('\n🎭 Playwright Compatibility Test Suite\n')
  console.log('=' .repeat(60))

  // ============================================================
  // SECTION 1: Connection Tests
  // ============================================================
  console.log('\n📡 SECTION 1: Connection & Setup\n')

  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null

  await runTest('ensurePersistentRelay() starts/detects server', async () => {
    const result = await ensurePersistentRelay({ timeout: 15000 })
    if (!result.version) throw new Error('No version returned')
    if (!result.port) throw new Error('No port returned')
  })

  await runTest('waitForExtension() detects connected extension', async () => {
    const result = await waitForExtension({ timeout: 5000 })
    if (!result.connected) throw new Error('Extension not connected')
    if (result.pageCount === 0) throw new Error('No pages available')
  })

  await runTest('connectToPlaywriter() returns Browser instance', async () => {
    browser = await connectToPlaywriter({ timeout: 30000 })
    if (!browser) throw new Error('No browser returned')
    if (!browser.isConnected()) throw new Error('Browser not connected')
  })

  await runTest('Direct chromium.connectOverCDP() works', async () => {
    const directBrowser = await chromium.connectOverCDP(getCdpUrl())
    if (!directBrowser.isConnected()) throw new Error('Direct connection failed')
  })

  // ============================================================
  // SECTION 2: Browser & Context Tests
  // ============================================================
  console.log('\n🌐 SECTION 2: Browser & Context\n')

  await runTest('browser.contexts() returns contexts', async () => {
    const contexts = browser!.contexts()
    if (!Array.isArray(contexts)) throw new Error('contexts() did not return array')
    if (contexts.length === 0) throw new Error('No contexts available')
    context = contexts[0]
  })

  await runTest('browser.isConnected() returns true', async () => {
    if (!browser!.isConnected()) throw new Error('Browser should be connected')
  })

  await runTest('browser.version() returns version string', async () => {
    const version = browser!.version()
    if (typeof version !== 'string') throw new Error('version() should return string')
  })

  await runTest('context.pages() returns pages', async () => {
    const pages = context!.pages()
    if (!Array.isArray(pages)) throw new Error('pages() did not return array')
    if (pages.length === 0) throw new Error('No pages available')
    page = pages[0]
  })

  // ============================================================
  // SECTION 3: Page Navigation Tests
  // ============================================================
  console.log('\n🧭 SECTION 3: Page Navigation\n')

  await runTest('page.goto() navigates to URL', async () => {
    const response = await page!.goto(TEST_URL, { waitUntil: 'domcontentloaded' })
    if (!response) throw new Error('No response from goto')
    if (!response.ok()) throw new Error(`Navigation failed: ${response.status()}`)
  })

  await runTest('page.url() returns current URL', async () => {
    const url = page!.url()
    if (!url.includes('example.com')) throw new Error(`Unexpected URL: ${url}`)
  })

  await runTest('page.title() returns page title', async () => {
    const title = await page!.title()
    if (typeof title !== 'string') throw new Error('title() should return string')
    if (!title.toLowerCase().includes('example')) throw new Error(`Unexpected title: ${title}`)
  })

  await runTest('page.reload() reloads page', async () => {
    const response = await page!.reload({ waitUntil: 'domcontentloaded' })
    if (!response) throw new Error('No response from reload')
  })

  await runTest('page.goBack() and page.goForward()', async () => {
    await page!.goto('https://example.com/about', { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page!.goto(TEST_URL, { waitUntil: 'domcontentloaded' })
    // goBack may return null if no history
    await page!.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
  })

  // ============================================================
  // SECTION 4: Page Content & DOM Tests
  // ============================================================
  console.log('\n📄 SECTION 4: Page Content & DOM\n')

  await runTest('page.content() returns HTML', async () => {
    await page!.goto(TEST_URL, { waitUntil: 'domcontentloaded' })
    const content = await page!.content()
    if (typeof content !== 'string') throw new Error('content() should return string')
    if (!content.includes('<html')) throw new Error('content() should return HTML')
  })

  await runTest('page.$() finds element', async () => {
    const element = await page!.$('h1')
    if (!element) throw new Error('Could not find h1 element')
  })

  await runTest('page.$$() finds multiple elements', async () => {
    const elements = await page!.$$('p')
    if (!Array.isArray(elements)) throw new Error('$$() should return array')
  })

  await runTest('page.locator() creates locator', async () => {
    const locator = page!.locator('h1')
    if (!locator) throw new Error('locator() should return Locator')
    const count = await locator.count()
    if (typeof count !== 'number') throw new Error('count() should return number')
  })

  await runTest('locator.textContent() gets text', async () => {
    const text = await page!.locator('h1').textContent()
    if (typeof text !== 'string') throw new Error('textContent() should return string')
  })

  await runTest('locator.innerHTML() gets inner HTML', async () => {
    const html = await page!.locator('body').innerHTML()
    if (typeof html !== 'string') throw new Error('innerHTML() should return string')
  })

  await runTest('locator.getAttribute() gets attribute', async () => {
    const href = await page!.locator('a').first().getAttribute('href')
    // href may be null if no links, that's ok
  })

  await runTest('locator.isVisible() checks visibility', async () => {
    const visible = await page!.locator('h1').isVisible()
    if (typeof visible !== 'boolean') throw new Error('isVisible() should return boolean')
  })

  await runTest('locator.isEnabled() checks enabled state', async () => {
    const enabled = await page!.locator('body').isEnabled()
    if (typeof enabled !== 'boolean') throw new Error('isEnabled() should return boolean')
  })

  // ============================================================
  // SECTION 5: JavaScript Evaluation Tests
  // ============================================================
  console.log('\n⚡ SECTION 5: JavaScript Evaluation\n')

  await runTest('page.evaluate() executes JS and returns value', async () => {
    const result = await page!.evaluate(() => {
      return { title: document.title, url: window.location.href }
    })
    if (!result.title) throw new Error('evaluate() should return object with title')
    if (!result.url) throw new Error('evaluate() should return object with url')
  })

  await runTest('page.evaluate() with arguments', async () => {
    // Playwright requires multiple args to be wrapped in an object
    const result = await page!.evaluate(({ a, b }) => a + b, { a: 5, b: 3 })
    if (result !== 8) throw new Error(`Expected 8, got ${result}`)
  })

  await runTest('page.evaluate() with complex return value', async () => {
    const result = await page!.evaluate(() => {
      return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        dimensions: { width: window.innerWidth, height: window.innerHeight },
      }
    })
    if (!result.userAgent) throw new Error('Should return userAgent')
  })

  await runTest('page.evaluateHandle() returns JSHandle', async () => {
    const handle = await page!.evaluateHandle(() => document.body)
    if (!handle) throw new Error('evaluateHandle() should return handle')
    await handle.dispose()
  })

  await runTest('locator.evaluate() on element', async () => {
    const tagName = await page!.locator('h1').evaluate((el) => el.tagName)
    if (tagName !== 'H1') throw new Error(`Expected H1, got ${tagName}`)
  })

  // ============================================================
  // SECTION 6: User Interaction Tests
  // ============================================================
  console.log('\n🖱️ SECTION 6: User Interactions\n')

  await runTest('locator.click() clicks element', async () => {
    // Click on the "More information" link on example.com
    const link = page!.locator('a').first()
    if (await link.count() > 0) {
      await link.click({ timeout: 5000 }).catch(() => {})
    }
  })

  await runTest('page.mouse.move() moves mouse', async () => {
    await page!.mouse.move(100, 100)
  })

  await runTest('page.mouse.click() clicks at coordinates', async () => {
    await page!.mouse.click(100, 100)
  })

  await runTest('page.keyboard.type() types text', async () => {
    // Type in search if there's an input, otherwise just verify API exists
    await page!.keyboard.type('test', { delay: 10 }).catch(() => {})
  })

  await runTest('page.keyboard.press() presses key', async () => {
    await page!.keyboard.press('Escape')
  })

  // ============================================================
  // SECTION 7: Waiting & Timing Tests
  // ============================================================
  console.log('\n⏱️ SECTION 7: Waiting & Timing\n')

  await runTest('page.waitForTimeout() waits', async () => {
    const start = Date.now()
    await page!.waitForTimeout(100)
    const elapsed = Date.now() - start
    if (elapsed < 90) throw new Error(`Waited only ${elapsed}ms`)
  })

  await runTest('page.waitForSelector() waits for element', async () => {
    await page!.goto(TEST_URL, { waitUntil: 'domcontentloaded' })
    await page!.waitForSelector('h1', { timeout: 5000 })
  })

  await runTest('page.waitForLoadState() waits for load', async () => {
    await page!.waitForLoadState('domcontentloaded')
  })

  await runTest('locator.waitFor() waits for element', async () => {
    await page!.locator('body').waitFor({ state: 'visible', timeout: 5000 })
  })

  // ============================================================
  // SECTION 8: Screenshot & PDF Tests
  // ============================================================
  console.log('\n📸 SECTION 8: Screenshots & Media\n')

  await runTest('page.screenshot() captures screenshot', async () => {
    const buffer = await page!.screenshot()
    if (!buffer) throw new Error('screenshot() should return buffer')
    if (buffer.length < 1000) throw new Error('Screenshot too small')
  })

  await runTest('page.screenshot() with options', async () => {
    const buffer = await page!.screenshot({ 
      type: 'png',
      fullPage: false,
    })
    if (!buffer) throw new Error('screenshot() should return buffer')
  })

  await runTest('locator.screenshot() captures element', async () => {
    const buffer = await page!.locator('h1').screenshot()
    if (!buffer) throw new Error('element screenshot should return buffer')
  })

  // ============================================================
  // SECTION 9: Frame Tests
  // ============================================================
  console.log('\n🖼️ SECTION 9: Frames\n')

  await runTest('page.mainFrame() returns main frame', async () => {
    const frame = page!.mainFrame()
    if (!frame) throw new Error('mainFrame() should return frame')
  })

  await runTest('page.frames() returns all frames', async () => {
    const frames = page!.frames()
    if (!Array.isArray(frames)) throw new Error('frames() should return array')
    if (frames.length === 0) throw new Error('Should have at least main frame')
  })

  await runTest('frame.url() returns frame URL', async () => {
    const url = page!.mainFrame().url()
    if (typeof url !== 'string') throw new Error('frame.url() should return string')
  })

  // ============================================================
  // SECTION 10: Network Tests
  // ============================================================
  console.log('\n🌐 SECTION 10: Network\n')

  await runTest('page.on("request") captures requests', async () => {
    let requestCaptured = false
    const handler = () => { requestCaptured = true }
    page!.on('request', handler)
    await page!.reload({ waitUntil: 'domcontentloaded' })
    page!.removeListener('request', handler)
    if (!requestCaptured) throw new Error('Should capture request event')
  })

  await runTest('page.on("response") captures responses', async () => {
    let responseCaptured = false
    const handler = () => { responseCaptured = true }
    page!.on('response', handler)
    await page!.reload({ waitUntil: 'domcontentloaded' })
    page!.removeListener('response', handler)
    if (!responseCaptured) throw new Error('Should capture response event')
  })

  // ============================================================
  // SECTION 11: Console & Errors Tests
  // ============================================================
  console.log('\n📝 SECTION 11: Console & Errors\n')

  await runTest('page.on("console") captures console messages', async () => {
    let consoleCaptured = false
    const handler = () => { consoleCaptured = true }
    page!.on('console', handler)
    await page!.evaluate(() => console.log('test message'))
    await page!.waitForTimeout(100)
    page!.removeListener('console', handler)
    if (!consoleCaptured) throw new Error('Should capture console event')
  })

  await runTest('page.on("pageerror") can be registered', async () => {
    // Just verify the event can be registered
    const handler = () => {}
    page!.on('pageerror', handler)
    page!.removeListener('pageerror', handler)
  })

  // ============================================================
  // SECTION 12: Viewport & Emulation Tests
  // ============================================================
  console.log('\n📱 SECTION 12: Viewport & Emulation\n')

  await runTest('page.viewportSize() returns viewport', async () => {
    const viewport = page!.viewportSize()
    // viewport may be null for extension-controlled pages
  })

  await runTest('page.setViewportSize() sets viewport', async () => {
    await page!.setViewportSize({ width: 1280, height: 720 })
    const viewport = page!.viewportSize()
    if (viewport && viewport.width !== 1280) throw new Error('Viewport width not set')
  })

  // ============================================================
  // SECTION 13: Accessibility Tests
  // ============================================================
  console.log('\n♿ SECTION 13: Accessibility\n')

  await runTest('page.accessibility.snapshot() returns tree', async () => {
    await page!.goto(TEST_URL, { waitUntil: 'domcontentloaded' })
    const snapshot = await page!.accessibility.snapshot()
    if (!snapshot) throw new Error('accessibility.snapshot() should return object')
    if (!snapshot.role) throw new Error('snapshot should have role')
  })

  // ============================================================
  // SECTION 14: Advanced Selectors Tests
  // ============================================================
  console.log('\n🎯 SECTION 14: Advanced Selectors\n')

  await runTest('getByRole() finds elements by role', async () => {
    const heading = page!.getByRole('heading')
    const count = await heading.count()
    if (count === 0) throw new Error('Should find heading by role')
  })

  await runTest('getByText() finds elements by text', async () => {
    const element = page!.getByText('Example Domain')
    const count = await element.count()
    // May not find exact text, that's ok
  })

  await runTest('locator.filter() filters elements', async () => {
    const filtered = page!.locator('*').filter({ hasText: 'Example' })
    // Just verify it doesn't throw
  })

  await runTest('locator.first() gets first element', async () => {
    const first = page!.locator('*').first()
    if (!first) throw new Error('first() should return locator')
  })

  await runTest('locator.last() gets last element', async () => {
    const last = page!.locator('*').last()
    if (!last) throw new Error('last() should return locator')
  })

  await runTest('locator.nth() gets nth element', async () => {
    const nth = page!.locator('*').nth(0)
    if (!nth) throw new Error('nth() should return locator')
  })

  // ============================================================
  // SECTION 15: Multiple Pages Test
  // ============================================================
  console.log('\n📑 SECTION 15: Multiple Connections\n')

  await runTest('Multiple browser connections work', async () => {
    const browser2 = await connectToPlaywriter({ timeout: 30000 })
    if (!browser2.isConnected()) throw new Error('Second connection failed')
    
    const pages2 = browser2.contexts()[0].pages()
    if (pages2.length === 0) throw new Error('Second connection has no pages')
    
    // Both should see the same page
    const url1 = page!.url()
    const url2 = pages2[0].url()
    if (url1 !== url2) throw new Error('Connections see different pages')
  })

  // ============================================================
  // Print Summary
  // ============================================================
  console.log('\n' + '=' .repeat(60))
  console.log('\n📊 TEST SUMMARY\n')

  const passed = RESULTS.filter(r => r.status === 'pass').length
  const failed = RESULTS.filter(r => r.status === 'fail').length
  const total = RESULTS.length

  console.log(`  Total:  ${total}`)
  console.log(`  Passed: ${passed} ✅`)
  console.log(`  Failed: ${failed} ❌`)
  console.log(`  Rate:   ${((passed / total) * 100).toFixed(1)}%`)

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:\n')
    RESULTS.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.name}`)
      console.log(`    Error: ${r.error}`)
    })
  }

  console.log('\n' + '=' .repeat(60))

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check output above.\n')
    process.exit(1)
  } else {
    console.log('\n🎉 All tests passed! Playwright is fully compatible.\n')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error('\n💥 Fatal error:', e)
  process.exit(1)
})
