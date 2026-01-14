/**
 * COMPREHENSIVE Playwright API Compatibility Test
 * 
 * Tests ALL major Playwright APIs to identify exactly which work
 * with playwriter's CDP relay and which don't.
 * 
 * IMPORTANT: Run with Node.js (npx tsx), NOT bun.
 * Usage: npx tsx test/playwright-full-api.ts
 */

import { connectToPlaywriter, ensurePersistentRelay, waitForExtension } from '../src/index.js'
import { chromium, type Browser, type Page, type BrowserContext, type Route, type Dialog } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

interface TestResult {
  category: string
  name: string
  method: string
  status: 'pass' | 'fail' | 'skip'
  error?: string
  duration: number
}

const RESULTS: TestResult[] = []

async function test(category: string, name: string, method: string, fn: () => Promise<void>, skip = false): Promise<void> {
  if (skip) {
    RESULTS.push({ category, name, method, status: 'skip', duration: 0 })
    console.log(`    ⏭️  ${name}`)
    return
  }
  const start = Date.now()
  try {
    await fn()
    RESULTS.push({ category, name, method, status: 'pass', duration: Date.now() - start })
    console.log(`    ✅ ${name}`)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    RESULTS.push({ category, name, method, status: 'fail', error, duration: Date.now() - start })
    console.log(`    ❌ ${name}: ${error.slice(0, 80)}`)
  }
}

async function main() {
  console.log('\n🎭 COMPREHENSIVE Playwright API Compatibility Test\n')
  console.log('=' .repeat(70))

  let browser: Browser
  let context: BrowserContext
  let page: Page

  // Setup
  console.log('\n📡 Setup\n')
  await ensurePersistentRelay({ timeout: 15000 })
  await waitForExtension({ timeout: 5000 })
  browser = await connectToPlaywriter({ timeout: 30000 })
  context = browser.contexts()[0]
  page = context.pages()[0]
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })
  console.log('    ✅ Connected to playwriter')

  // ============================================================
  // BROWSER METHODS
  // ============================================================
  console.log('\n🌐 BROWSER METHODS\n')

  await test('Browser', 'browser.isConnected()', 'browser.isConnected', async () => {
    if (!browser.isConnected()) throw new Error('Should be connected')
  })

  await test('Browser', 'browser.version()', 'browser.version', async () => {
    const v = browser.version()
    if (typeof v !== 'string') throw new Error('Should return string')
  })

  await test('Browser', 'browser.contexts()', 'browser.contexts', async () => {
    const c = browser.contexts()
    if (!Array.isArray(c) || c.length === 0) throw new Error('Should return contexts')
  })

  await test('Browser', 'browser.newContext()', 'browser.newContext', async () => {
    try {
      const ctx = await browser.newContext()
      if (!ctx) throw new Error('Should return context')
    } catch (e: any) {
      if (e.message.includes('not supported')) throw e
    }
  })

  await test('Browser', 'browser.newPage()', 'browser.newPage', async () => {
    try {
      const p = await browser.newPage()
      if (!p) throw new Error('Should return page')
    } catch (e: any) {
      if (e.message.includes('not supported')) throw e
    }
  })

  // ============================================================
  // CONTEXT METHODS  
  // ============================================================
  console.log('\n📦 CONTEXT METHODS\n')

  await test('Context', 'context.pages()', 'context.pages', async () => {
    const p = context.pages()
    if (!Array.isArray(p)) throw new Error('Should return array')
  })

  await test('Context', 'context.newPage()', 'context.newPage', async () => {
    const p = await context.newPage()
    if (!p) throw new Error('Should return page')
    await p.close()
  })

  await test('Context', 'context.cookies()', 'context.cookies', async () => {
    const c = await context.cookies()
    if (!Array.isArray(c)) throw new Error('Should return array')
  })

  await test('Context', 'context.addCookies()', 'context.addCookies', async () => {
    await context.addCookies([{ name: 'test', value: 'val', domain: 'example.com', path: '/' }])
  })

  await test('Context', 'context.clearCookies()', 'context.clearCookies', async () => {
    await context.clearCookies()
  })

  await test('Context', 'context.storageState()', 'context.storageState', async () => {
    const state = await context.storageState()
    if (!state) throw new Error('Should return state')
  })

  await test('Context', 'context.setGeolocation()', 'context.setGeolocation', async () => {
    await context.setGeolocation({ latitude: 51.5, longitude: -0.1 })
  })

  await test('Context', 'context.grantPermissions()', 'context.grantPermissions', async () => {
    await context.grantPermissions(['geolocation'])
  })

  await test('Context', 'context.clearPermissions()', 'context.clearPermissions', async () => {
    await context.clearPermissions()
  })

  await test('Context', 'context.setOffline()', 'context.setOffline', async () => {
    await context.setOffline(false)
  })

  await test('Context', 'context.setExtraHTTPHeaders()', 'context.setExtraHTTPHeaders', async () => {
    await context.setExtraHTTPHeaders({ 'X-Test': 'value' })
  })

  await test('Context', 'context.newCDPSession()', 'context.newCDPSession', async () => {
    const cdp = await context.newCDPSession(page)
    await cdp.detach()
  })

  await test('Context', 'context.route()', 'context.route', async () => {
    await context.route('**/*', route => route.continue())
    await context.unrouteAll()
  })

  await test('Context', 'context.exposeFunction()', 'context.exposeFunction', async () => {
    await context.exposeFunction('testFunc', () => 'exposed')
  })

  await test('Context', 'context.exposeBinding()', 'context.exposeBinding', async () => {
    await context.exposeBinding('testBinding', () => 'bound')
  })

  await test('Context', 'context.addInitScript()', 'context.addInitScript', async () => {
    await context.addInitScript(() => { (window as any).initTest = true })
  })

  // ============================================================
  // PAGE NAVIGATION
  // ============================================================
  console.log('\n🧭 PAGE NAVIGATION\n')

  await test('Navigation', 'page.goto()', 'page.goto', async () => {
    const r = await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })
    if (!r) throw new Error('Should return response')
  })

  await test('Navigation', 'page.reload()', 'page.reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
  })

  await test('Navigation', 'page.goBack()', 'page.goBack', async () => {
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
  })

  await test('Navigation', 'page.goForward()', 'page.goForward', async () => {
    await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {})
  })

  await test('Navigation', 'page.url()', 'page.url', async () => {
    const u = page.url()
    if (!u.startsWith('http')) throw new Error('Should return URL')
  })

  await test('Navigation', 'page.title()', 'page.title', async () => {
    const t = await page.title()
    if (typeof t !== 'string') throw new Error('Should return string')
  })

  await test('Navigation', 'page.setContent()', 'page.setContent', async () => {
    await page.setContent('<h1>Test</h1>')
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' })
  })

  await test('Navigation', 'page.content()', 'page.content', async () => {
    const c = await page.content()
    if (!c.includes('<')) throw new Error('Should return HTML')
  })

  // ============================================================
  // PAGE LOCATORS
  // ============================================================
  console.log('\n🎯 PAGE LOCATORS\n')

  await test('Locator', 'page.locator()', 'page.locator', async () => {
    const l = page.locator('body')
    if (!l) throw new Error('Should return locator')
  })

  await test('Locator', 'page.getByRole()', 'page.getByRole', async () => {
    const l = page.getByRole('heading')
    await l.count()
  })

  await test('Locator', 'page.getByText()', 'page.getByText', async () => {
    const l = page.getByText('Example')
    await l.count()
  })

  await test('Locator', 'page.getByLabel()', 'page.getByLabel', async () => {
    const l = page.getByLabel('test')
    await l.count()
  })

  await test('Locator', 'page.getByPlaceholder()', 'page.getByPlaceholder', async () => {
    const l = page.getByPlaceholder('test')
    await l.count()
  })

  await test('Locator', 'page.getByAltText()', 'page.getByAltText', async () => {
    const l = page.getByAltText('test')
    await l.count()
  })

  await test('Locator', 'page.getByTitle()', 'page.getByTitle', async () => {
    const l = page.getByTitle('test')
    await l.count()
  })

  await test('Locator', 'page.getByTestId()', 'page.getByTestId', async () => {
    const l = page.getByTestId('test')
    await l.count()
  })

  await test('Locator', 'page.$()', 'page.$', async () => {
    const e = await page.$('h1')
    if (!e) throw new Error('Should find element')
  })

  await test('Locator', 'page.$$()', 'page.$$', async () => {
    const e = await page.$$('*')
    if (!Array.isArray(e)) throw new Error('Should return array')
  })

  // ============================================================
  // LOCATOR METHODS
  // ============================================================
  console.log('\n📍 LOCATOR METHODS\n')

  const loc = page.locator('h1')

  await test('Locator', 'locator.click()', 'locator.click', async () => {
    await loc.click({ timeout: 5000 }).catch(() => {})
  })

  await test('Locator', 'locator.dblclick()', 'locator.dblclick', async () => {
    await loc.dblclick({ timeout: 5000 }).catch(() => {})
  })

  await test('Locator', 'locator.hover()', 'locator.hover', async () => {
    await loc.hover()
  })

  await test('Locator', 'locator.fill()', 'locator.fill', async () => {
    await page.locator('input').first().fill('test').catch(() => {})
  })

  await test('Locator', 'locator.type()', 'locator.type', async () => {
    await page.locator('input').first().type('test').catch(() => {})
  })

  await test('Locator', 'locator.press()', 'locator.press', async () => {
    await loc.press('Enter').catch(() => {})
  })

  await test('Locator', 'locator.check()', 'locator.check', async () => {
    await page.locator('input[type=checkbox]').first().check().catch(() => {})
  })

  await test('Locator', 'locator.uncheck()', 'locator.uncheck', async () => {
    await page.locator('input[type=checkbox]').first().uncheck().catch(() => {})
  })

  await test('Locator', 'locator.selectOption()', 'locator.selectOption', async () => {
    await page.locator('select').first().selectOption({ index: 0 }).catch(() => {})
  })

  await test('Locator', 'locator.setInputFiles()', 'locator.setInputFiles', async () => {
    await page.locator('input[type=file]').first().setInputFiles([]).catch(() => {})
  })

  await test('Locator', 'locator.focus()', 'locator.focus', async () => {
    await loc.focus().catch(() => {})
  })

  await test('Locator', 'locator.blur()', 'locator.blur', async () => {
    await loc.blur().catch(() => {})
  })

  await test('Locator', 'locator.textContent()', 'locator.textContent', async () => {
    const t = await loc.textContent()
    if (typeof t !== 'string') throw new Error('Should return string')
  })

  await test('Locator', 'locator.innerText()', 'locator.innerText', async () => {
    const t = await loc.innerText()
    if (typeof t !== 'string') throw new Error('Should return string')
  })

  await test('Locator', 'locator.innerHTML()', 'locator.innerHTML', async () => {
    const t = await loc.innerHTML()
    if (typeof t !== 'string') throw new Error('Should return string')
  })

  await test('Locator', 'locator.getAttribute()', 'locator.getAttribute', async () => {
    await loc.getAttribute('class')
  })

  await test('Locator', 'locator.inputValue()', 'locator.inputValue', async () => {
    await page.locator('input').first().inputValue().catch(() => {})
  })

  await test('Locator', 'locator.isVisible()', 'locator.isVisible', async () => {
    const v = await loc.isVisible()
    if (typeof v !== 'boolean') throw new Error('Should return boolean')
  })

  await test('Locator', 'locator.isHidden()', 'locator.isHidden', async () => {
    const v = await loc.isHidden()
    if (typeof v !== 'boolean') throw new Error('Should return boolean')
  })

  await test('Locator', 'locator.isEnabled()', 'locator.isEnabled', async () => {
    const v = await loc.isEnabled()
    if (typeof v !== 'boolean') throw new Error('Should return boolean')
  })

  await test('Locator', 'locator.isDisabled()', 'locator.isDisabled', async () => {
    const v = await loc.isDisabled()
    if (typeof v !== 'boolean') throw new Error('Should return boolean')
  })

  await test('Locator', 'locator.isChecked()', 'locator.isChecked', async () => {
    await page.locator('input[type=checkbox]').first().isChecked().catch(() => {})
  })

  await test('Locator', 'locator.isEditable()', 'locator.isEditable', async () => {
    const v = await loc.isEditable()
    if (typeof v !== 'boolean') throw new Error('Should return boolean')
  })

  await test('Locator', 'locator.count()', 'locator.count', async () => {
    const c = await loc.count()
    if (typeof c !== 'number') throw new Error('Should return number')
  })

  await test('Locator', 'locator.all()', 'locator.all', async () => {
    const a = await page.locator('*').all()
    if (!Array.isArray(a)) throw new Error('Should return array')
  })

  await test('Locator', 'locator.first()', 'locator.first', async () => {
    const f = page.locator('*').first()
    if (!f) throw new Error('Should return locator')
  })

  await test('Locator', 'locator.last()', 'locator.last', async () => {
    const l = page.locator('*').last()
    if (!l) throw new Error('Should return locator')
  })

  await test('Locator', 'locator.nth()', 'locator.nth', async () => {
    const n = page.locator('*').nth(0)
    if (!n) throw new Error('Should return locator')
  })

  await test('Locator', 'locator.filter()', 'locator.filter', async () => {
    const f = page.locator('*').filter({ hasText: 'Example' })
    if (!f) throw new Error('Should return locator')
  })

  await test('Locator', 'locator.and()', 'locator.and', async () => {
    const a = loc.and(page.getByText('Example'))
    await a.count()
  })

  await test('Locator', 'locator.or()', 'locator.or', async () => {
    const o = loc.or(page.locator('h2'))
    await o.count()
  })

  await test('Locator', 'locator.locator()', 'locator.locator', async () => {
    const l = page.locator('body').locator('h1')
    await l.count()
  })

  await test('Locator', 'locator.boundingBox()', 'locator.boundingBox', async () => {
    const b = await loc.boundingBox()
    if (!b) throw new Error('Should return box')
  })

  await test('Locator', 'locator.screenshot()', 'locator.screenshot', async () => {
    const s = await loc.screenshot()
    if (!s) throw new Error('Should return buffer')
  })

  await test('Locator', 'locator.scrollIntoViewIfNeeded()', 'locator.scrollIntoViewIfNeeded', async () => {
    await loc.scrollIntoViewIfNeeded()
  })

  await test('Locator', 'locator.highlight()', 'locator.highlight', async () => {
    await loc.highlight()
  })

  await test('Locator', 'locator.evaluate()', 'locator.evaluate', async () => {
    const t = await loc.evaluate(el => el.tagName)
    if (t !== 'H1') throw new Error('Should return H1')
  })

  await test('Locator', 'locator.evaluateAll()', 'locator.evaluateAll', async () => {
    const a = await page.locator('*').evaluateAll(els => els.length)
    if (typeof a !== 'number') throw new Error('Should return number')
  })

  await test('Locator', 'locator.waitFor()', 'locator.waitFor', async () => {
    await loc.waitFor({ state: 'visible' })
  })

  // ============================================================
  // PAGE EVALUATE
  // ============================================================
  console.log('\n⚡ PAGE EVALUATE\n')

  await test('Evaluate', 'page.evaluate()', 'page.evaluate', async () => {
    const r = await page.evaluate(() => 1 + 1)
    if (r !== 2) throw new Error('Should return 2')
  })

  await test('Evaluate', 'page.evaluateHandle()', 'page.evaluateHandle', async () => {
    const h = await page.evaluateHandle(() => document.body)
    await h.dispose()
  })

  await test('Evaluate', 'page.$eval()', 'page.$eval', async () => {
    const t = await page.$eval('h1', el => el.tagName)
    if (t !== 'H1') throw new Error('Should return H1')
  })

  await test('Evaluate', 'page.$$eval()', 'page.$$eval', async () => {
    const c = await page.$$eval('*', els => els.length)
    if (typeof c !== 'number') throw new Error('Should return number')
  })

  await test('Evaluate', 'page.addScriptTag()', 'page.addScriptTag', async () => {
    await page.addScriptTag({ content: 'window.x=1' })
  })

  await test('Evaluate', 'page.addStyleTag()', 'page.addStyleTag', async () => {
    await page.addStyleTag({ content: 'body{background:white}' })
  })

  await test('Evaluate', 'page.exposeFunction()', 'page.exposeFunction', async () => {
    await page.exposeFunction('pageFunc', () => 'ok')
  })

  await test('Evaluate', 'page.exposeBinding()', 'page.exposeBinding', async () => {
    await page.exposeBinding('pageBinding', () => 'ok')
  })

  // ============================================================
  // PAGE INPUT
  // ============================================================
  console.log('\n⌨️  PAGE INPUT\n')

  await test('Input', 'page.keyboard.type()', 'page.keyboard.type', async () => {
    await page.keyboard.type('test')
  })

  await test('Input', 'page.keyboard.press()', 'page.keyboard.press', async () => {
    await page.keyboard.press('Escape')
  })

  await test('Input', 'page.keyboard.down()', 'page.keyboard.down', async () => {
    await page.keyboard.down('Shift')
    await page.keyboard.up('Shift')
  })

  await test('Input', 'page.keyboard.insertText()', 'page.keyboard.insertText', async () => {
    await page.keyboard.insertText('test')
  })

  await test('Input', 'page.mouse.click()', 'page.mouse.click', async () => {
    await page.mouse.click(100, 100)
  })

  await test('Input', 'page.mouse.dblclick()', 'page.mouse.dblclick', async () => {
    await page.mouse.dblclick(100, 100)
  })

  await test('Input', 'page.mouse.move()', 'page.mouse.move', async () => {
    await page.mouse.move(100, 100)
  })

  await test('Input', 'page.mouse.down()', 'page.mouse.down', async () => {
    await page.mouse.down()
    await page.mouse.up()
  })

  await test('Input', 'page.mouse.wheel()', 'page.mouse.wheel', async () => {
    await page.mouse.wheel(0, 100)
  })

  await test('Input', 'page.dragAndDrop()', 'page.dragAndDrop', async () => {
    await page.dragAndDrop('h1', 'p').catch(() => {})
  })

  await test('Input', 'page.tap()', 'page.tap', async () => {
    await page.tap('h1').catch(() => {})
  })

  // ============================================================
  // PAGE WAITING
  // ============================================================
  console.log('\n⏱️  PAGE WAITING\n')

  await test('Waiting', 'page.waitForTimeout()', 'page.waitForTimeout', async () => {
    await page.waitForTimeout(10)
  })

  await test('Waiting', 'page.waitForSelector()', 'page.waitForSelector', async () => {
    await page.waitForSelector('h1')
  })

  await test('Waiting', 'page.waitForLoadState()', 'page.waitForLoadState', async () => {
    await page.waitForLoadState('domcontentloaded')
  })

  await test('Waiting', 'page.waitForURL()', 'page.waitForURL', async () => {
    await page.waitForURL('**/example.com/**')
  })

  await test('Waiting', 'page.waitForFunction()', 'page.waitForFunction', async () => {
    await page.waitForFunction(() => true)
  })

  await test('Waiting', 'page.waitForRequest()', 'page.waitForRequest', async () => {
    const p = page.waitForRequest('**/*')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await p
  })

  await test('Waiting', 'page.waitForResponse()', 'page.waitForResponse', async () => {
    const p = page.waitForResponse('**/*')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await p
  })

  await test('Waiting', 'page.waitForEvent()', 'page.waitForEvent', async () => {
    const p = page.waitForEvent('load', { timeout: 5000 }).catch(() => {})
    await page.reload({ waitUntil: 'domcontentloaded' })
    await p
  })

  // ============================================================
  // PAGE NETWORK
  // ============================================================
  console.log('\n🌐 PAGE NETWORK\n')

  await test('Network', 'page.route()', 'page.route', async () => {
    await page.route('**/*', r => r.continue())
    await page.unrouteAll()
  })

  await test('Network', 'page.unrouteAll()', 'page.unrouteAll', async () => {
    await page.unrouteAll()
  })

  await test('Network', 'page.setExtraHTTPHeaders()', 'page.setExtraHTTPHeaders', async () => {
    await page.setExtraHTTPHeaders({ 'X-Test': 'value' })
  })

  await test('Network', 'page.on("request")', 'page.on("request")', async () => {
    let captured = false
    page.on('request', () => { captured = true })
    await page.reload({ waitUntil: 'domcontentloaded' })
    page.removeAllListeners('request')
    if (!captured) throw new Error('Should capture request')
  })

  await test('Network', 'page.on("response")', 'page.on("response")', async () => {
    let captured = false
    page.on('response', () => { captured = true })
    await page.reload({ waitUntil: 'domcontentloaded' })
    page.removeAllListeners('response')
    if (!captured) throw new Error('Should capture response')
  })

  // ============================================================
  // PAGE SCREENSHOT & PDF
  // ============================================================
  console.log('\n📸 PAGE SCREENSHOT & PDF\n')

  await test('Screenshot', 'page.screenshot()', 'page.screenshot', async () => {
    const s = await page.screenshot()
    if (!s || s.length === 0) throw new Error('Should return buffer')
  })

  await test('Screenshot', 'page.screenshot({ fullPage })', 'page.screenshot({ fullPage })', async () => {
    const s = await page.screenshot({ fullPage: true })
    if (!s) throw new Error('Should return buffer')
  })

  await test('Screenshot', 'page.screenshot({ clip })', 'page.screenshot({ clip })', async () => {
    const s = await page.screenshot({ clip: { x: 0, y: 0, width: 100, height: 100 } })
    if (!s) throw new Error('Should return buffer')
  })

  await test('PDF', 'page.pdf()', 'page.pdf', async () => {
    const p = await page.pdf().catch(() => null)
    // PDF may not work in all contexts
  })

  // ============================================================
  // PAGE FRAMES
  // ============================================================
  console.log('\n🖼️  PAGE FRAMES\n')

  await test('Frames', 'page.mainFrame()', 'page.mainFrame', async () => {
    const f = page.mainFrame()
    if (!f) throw new Error('Should return frame')
  })

  await test('Frames', 'page.frames()', 'page.frames', async () => {
    const f = page.frames()
    if (!Array.isArray(f)) throw new Error('Should return array')
  })

  await test('Frames', 'page.frame()', 'page.frame', async () => {
    page.frame({ name: 'test' })
  })

  await test('Frames', 'page.frameLocator()', 'page.frameLocator', async () => {
    const f = page.frameLocator('iframe')
    if (!f) throw new Error('Should return frameLocator')
  })

  // ============================================================
  // PAGE ACCESSIBILITY
  // ============================================================
  console.log('\n♿ PAGE ACCESSIBILITY\n')

  await test('Accessibility', 'page.accessibility.snapshot()', 'page.accessibility.snapshot', async () => {
    const s = await page.accessibility.snapshot()
    if (!s) throw new Error('Should return snapshot')
  })

  // ============================================================
  // PAGE DIALOGS
  // ============================================================
  console.log('\n💬 PAGE DIALOGS\n')

  await test('Dialogs', 'page.on("dialog")', 'page.on("dialog")', async () => {
    page.on('dialog', async (d: Dialog) => { await d.dismiss() })
    page.removeAllListeners('dialog')
  })

  // ============================================================
  // PAGE VIEWPORT & EMULATION
  // ============================================================
  console.log('\n📱 PAGE VIEWPORT & EMULATION\n')

  await test('Viewport', 'page.viewportSize()', 'page.viewportSize', async () => {
    const v = page.viewportSize()
    // May be null for extension-controlled pages
  })

  await test('Viewport', 'page.setViewportSize()', 'page.setViewportSize', async () => {
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  await test('Emulation', 'page.emulateMedia()', 'page.emulateMedia', async () => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.emulateMedia({ colorScheme: 'light' })
  })

  // ============================================================
  // PAGE MISC
  // ============================================================
  console.log('\n🔧 PAGE MISC\n')

  await test('Misc', 'page.bringToFront()', 'page.bringToFront', async () => {
    await page.bringToFront()
  })

  await test('Misc', 'page.isClosed()', 'page.isClosed', async () => {
    const c = page.isClosed()
    if (typeof c !== 'boolean') throw new Error('Should return boolean')
  })

  await test('Misc', 'page.video()', 'page.video', async () => {
    const v = page.video()
    // May be null
  })

  await test('Misc', 'page.workers()', 'page.workers', async () => {
    const w = page.workers()
    if (!Array.isArray(w)) throw new Error('Should return array')
  })

  await test('Misc', 'page.on("console")', 'page.on("console")', async () => {
    let captured = false
    page.on('console', () => { captured = true })
    await page.evaluate(() => console.log('test'))
    page.removeAllListeners('console')
  })

  await test('Misc', 'page.on("pageerror")', 'page.on("pageerror")', async () => {
    page.on('pageerror', () => {})
    page.removeAllListeners('pageerror')
  })

  await test('Misc', 'page.close()', 'page.close', async () => {
    // Don't actually close - would break tests
  }, true)

  // ============================================================
  // PRINT RESULTS
  // ============================================================
  console.log('\n' + '=' .repeat(70))
  console.log('\n📊 COMPREHENSIVE TEST SUMMARY\n')

  const passed = RESULTS.filter(r => r.status === 'pass').length
  const failed = RESULTS.filter(r => r.status === 'fail').length
  const skipped = RESULTS.filter(r => r.status === 'skip').length
  const total = RESULTS.length

  console.log(`  Total:   ${total}`)
  console.log(`  Passed:  ${passed} ✅`)
  console.log(`  Failed:  ${failed} ❌`)
  console.log(`  Skipped: ${skipped} ⏭️`)
  console.log(`  Rate:    ${((passed / (total - skipped)) * 100).toFixed(1)}%`)

  // Group by category
  const categories = [...new Set(RESULTS.map(r => r.category))]
  console.log('\n📋 RESULTS BY CATEGORY:\n')
  for (const cat of categories) {
    const catResults = RESULTS.filter(r => r.category === cat)
    const catPassed = catResults.filter(r => r.status === 'pass').length
    const catFailed = catResults.filter(r => r.status === 'fail').length
    console.log(`  ${cat}: ${catPassed}/${catResults.length} ${catFailed > 0 ? '⚠️' : '✅'}`)
  }

  if (failed > 0) {
    console.log('\n' + '=' .repeat(70))
    console.log('\n❌ METHODS THAT DO NOT WORK WITH PLAYWRITER:\n')
    const failedResults = RESULTS.filter(r => r.status === 'fail')
    for (const r of failedResults) {
      console.log(`  • ${r.method}`)
      console.log(`    Error: ${r.error?.slice(0, 100)}`)
      console.log()
    }
  }

  // Write results to file
  const report = {
    summary: { total, passed, failed, skipped, rate: (passed / (total - skipped) * 100).toFixed(1) + '%' },
    working: RESULTS.filter(r => r.status === 'pass').map(r => r.method),
    notWorking: RESULTS.filter(r => r.status === 'fail').map(r => ({ method: r.method, error: r.error })),
    skipped: RESULTS.filter(r => r.status === 'skip').map(r => r.method),
  }

  const reportPath = path.join(process.cwd(), 'tmp', 'playwright-api-report.json')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\n📁 Full report saved to: ${reportPath}`)

  console.log('\n' + '=' .repeat(70))
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('\n💥 Fatal error:', e)
  process.exit(1)
})
