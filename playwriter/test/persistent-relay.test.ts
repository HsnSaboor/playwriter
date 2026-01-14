import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { chromium, Browser } from 'playwright-core'
import { killPortProcess } from 'kill-port-process'
import {
  ensurePersistentRelay,
  waitForExtension,
  connectToPlaywriter,
  getCdpUrl,
  RelayServerError,
  ExtensionNotConnectedError,
  RelayServerStartError,
} from '../src/index.js'

const TEST_PORT = 19988 // Use default port where extension connects

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('Persistent Relay E2E Tests', () => {
  // These tests require the Chrome extension to be installed and enabled
  // Run with: bun run vitest run ./test/persistent-relay.test.ts

  describe('Error Classes', () => {
    it('RelayServerError should have correct properties', () => {
      const error = new RelayServerError('test message', 12345)
      expect(error.name).toBe('RelayServerError')
      expect(error.port).toBe(12345)
      expect(error.message).toContain('test message')
      expect(error.message).toContain('12345')
      expect(error.message).toContain('[Playwriter]')
      expect(error).toBeInstanceOf(Error)
    })

    it('ExtensionNotConnectedError should extend RelayServerError', () => {
      const error = new ExtensionNotConnectedError(19988)
      expect(error.name).toBe('ExtensionNotConnectedError')
      expect(error.port).toBe(19988)
      expect(error.message).toContain('Extension not connected')
      expect(error.message).toContain('click the Playwriter extension icon')
      expect(error).toBeInstanceOf(RelayServerError)
      expect(error).toBeInstanceOf(Error)
    })

    it('RelayServerStartError should include log path and port', () => {
      const error = new RelayServerStartError(19988)
      expect(error.name).toBe('RelayServerStartError')
      expect(error.port).toBe(19988)
      expect(error.message).toContain('relay-server.log')
      expect(error.message).toContain('Failed to start')
      expect(error).toBeInstanceOf(RelayServerError)
    })

    it('Error classes should have proper prototype chain for catch blocks', () => {
      const error = new ExtensionNotConnectedError(19988)

      // Can be caught as Error
      try {
        throw error
      } catch (e) {
        expect(e instanceof Error).toBe(true)
        expect(e instanceof RelayServerError).toBe(true)
        expect(e instanceof ExtensionNotConnectedError).toBe(true)
      }
    })
  })

  describe('ensurePersistentRelay', () => {
    afterAll(async () => {
      // Don't kill the server - leave it running for other tests
    })

    it('should start server and return correct result structure', async () => {
      const result = await ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 })

      expect(result).toHaveProperty('started')
      expect(result).toHaveProperty('version')
      expect(result).toHaveProperty('port')
      expect(result.port).toBe(TEST_PORT)
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(typeof result.started).toBe('boolean')
    }, 20000)

    it('should return started=false when server already running', async () => {
      // First call - may or may not start depending on state
      await ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 })

      // Second call - server definitely running now
      const result = await ensurePersistentRelay({ port: TEST_PORT, timeout: 5000 })

      expect(result.started).toBe(false)
      expect(result.port).toBe(TEST_PORT)
    }, 25000)

    it('should verify server is actually accessible after starting', async () => {
      await ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 })

      // Verify multiple endpoints work
      const versionResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/version`)
      expect(versionResponse.ok).toBe(true)
      const versionData = await versionResponse.json()
      expect(versionData).toHaveProperty('version')

      const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      expect(statusResponse.ok).toBe(true)
      const statusData = await statusResponse.json()
      expect(statusData).toHaveProperty('connected')
      expect(statusData).toHaveProperty('pageCount')
      expect(statusData).toHaveProperty('pages')
      expect(Array.isArray(statusData.pages)).toBe(true)
    }, 20000)

    it('should handle concurrent calls correctly', async () => {
      // Multiple concurrent calls should all succeed
      const results = await Promise.all([
        ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 }),
        ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 }),
        ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 }),
      ])

      // All should return the same version
      const versions = results.map((r) => r.version)
      expect(new Set(versions).size).toBe(1)

      // At most one should have started=true
      const startedCount = results.filter((r) => r.started).length
      expect(startedCount).toBeLessThanOrEqual(1)
    }, 25000)
  })

  describe('extension-status endpoint', () => {
    beforeAll(async () => {
      await ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 })
    })

    it('should return valid JSON with required fields', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      expect(response.ok).toBe(true)
      expect(response.headers.get('content-type')).toContain('application/json')

      const status = await response.json()
      expect(typeof status.connected).toBe('boolean')
      expect(typeof status.pageCount).toBe('number')
      expect(Array.isArray(status.pages)).toBe(true)
    })

    it('should have pageCount matching pages array length', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      const status = await response.json()

      expect(status.pageCount).toBe(status.pages.length)
    })

    it('should return page objects with correct structure when pages exist', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      const status = await response.json()

      if (status.pages.length > 0) {
        const page = status.pages[0]
        expect(page).toHaveProperty('targetId')
        expect(page).toHaveProperty('url')
        expect(page).toHaveProperty('title')
        expect(typeof page.targetId).toBe('string')
        expect(typeof page.url).toBe('string')
        expect(typeof page.title).toBe('string')
      }
    })
  })

  describe('waitForExtension', () => {
    beforeAll(async () => {
      await ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 })
    })

    it('should return immediately when extension already connected with pages', async () => {
      // Check if extension is connected first
      const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      const status = await statusResponse.json()

      if (status.connected && status.pageCount > 0) {
        const startTime = Date.now()
        const result = await waitForExtension({ port: TEST_PORT, timeout: 5000 })
        const elapsed = Date.now() - startTime

        expect(result.connected).toBe(true)
        expect(result.pageCount).toBeGreaterThan(0)
        // Should return quickly, not wait full timeout
        expect(elapsed).toBeLessThan(2000)
      } else {
        // Skip if extension not connected
        console.log('Skipping: Extension not connected or no pages')
      }
    }, 10000)

    it('should throw ExtensionNotConnectedError with short timeout when no extension', async () => {
      // Use a different port where no extension is connected
      const unusedPort = 19999

      // Start a server on the unused port
      const { spawn } = await import('node:child_process')
      const path = await import('node:path')
      const { fileURLToPath } = await import('node:url')

      const __filename = fileURLToPath(import.meta.url)
      const __dirname = path.dirname(__filename)
      const scriptPath = path.resolve(__dirname, '../src/start-relay-server.ts')

      // Kill any existing process
      try {
        await killPortProcess(unusedPort)
      } catch {}
      await sleep(500)

      const proc = spawn('bun', ['run', scriptPath], {
        env: { ...process.env, PLAYWRITER_PORT: String(unusedPort) },
        detached: true,
        stdio: 'ignore',
      })
      proc.unref()

      await sleep(2000) // Wait for server to start

      try {
        await expect(
          waitForExtension({ port: unusedPort, timeout: 1500 })
        ).rejects.toThrow(ExtensionNotConnectedError)
      } finally {
        try {
          await killPortProcess(unusedPort)
        } catch {}
      }
    }, 15000)

    it('should respect pollInterval option', async () => {
      const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      const status = await statusResponse.json()

      if (!status.connected || status.pageCount === 0) {
        // Test that short pollInterval causes more checks
        const startTime = Date.now()
        try {
          await waitForExtension({ port: TEST_PORT, timeout: 1000, pollInterval: 100 })
        } catch {
          // Expected to throw
        }
        const elapsed = Date.now() - startTime

        // Should have waited approximately the timeout duration
        expect(elapsed).toBeGreaterThanOrEqual(900)
        expect(elapsed).toBeLessThan(2000)
      }
    }, 10000)
  })

  describe('connectToPlaywriter - Full E2E', () => {
    let browser: Browser | null = null

    afterAll(async () => {
      // Don't explicitly disconnect - the browser connection will be cleaned up
      // when the test process exits. Calling close() would close the user's browser tabs.
      browser = null
    })

    it('should connect to browser and return valid Browser instance', async () => {
      // First check if extension is ready
      await ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 })
      const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      const status = await statusResponse.json()

      if (!status.connected || status.pageCount === 0) {
        console.log('Skipping E2E test: Extension not connected or no pages enabled')
        return
      }

      browser = await connectToPlaywriter({ port: TEST_PORT, timeout: 30000 })

      expect(browser).toBeDefined()
      expect(browser.isConnected()).toBe(true)
    }, 35000)

    it('should have accessible contexts and pages', async () => {
      if (!browser) {
        // Connect if previous test was skipped
        const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
        const status = await statusResponse.json()

        if (!status.connected || status.pageCount === 0) {
          console.log('Skipping: Extension not connected')
          return
        }

        browser = await connectToPlaywriter({ port: TEST_PORT, timeout: 30000 })
      }

      const contexts = browser.contexts()
      expect(contexts.length).toBeGreaterThan(0)

      const context = contexts[0]
      const pages = context.pages()
      expect(pages.length).toBeGreaterThan(0)

      const page = pages[0]
      expect(page).toBeDefined()
    }, 35000)

    it('should be able to get page URL and title', async () => {
      if (!browser) {
        const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
        const status = await statusResponse.json()

        if (!status.connected || status.pageCount === 0) {
          console.log('Skipping: Extension not connected')
          return
        }

        browser = await connectToPlaywriter({ port: TEST_PORT, timeout: 30000 })
      }

      const page = browser.contexts()[0].pages()[0]
      const url = page.url()
      const title = await page.title()

      expect(typeof url).toBe('string')
      expect(typeof title).toBe('string')
      console.log(`Connected to page: ${title} (${url})`)
    }, 35000)

    it('should be able to evaluate JavaScript in the page', async () => {
      if (!browser) {
        const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
        const status = await statusResponse.json()

        if (!status.connected || status.pageCount === 0) {
          console.log('Skipping: Extension not connected')
          return
        }

        browser = await connectToPlaywriter({ port: TEST_PORT, timeout: 30000 })
      }

      const page = browser.contexts()[0].pages()[0]

      // Evaluate simple JavaScript
      const result = await page.evaluate(() => {
        return {
          userAgent: navigator.userAgent,
          url: window.location.href,
          documentReady: document.readyState,
        }
      })

      expect(result).toHaveProperty('userAgent')
      expect(result).toHaveProperty('url')
      expect(result).toHaveProperty('documentReady')
      expect(typeof result.userAgent).toBe('string')
    }, 35000)

    it('should allow multiple connect/disconnect cycles', async () => {
      const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      const status = await statusResponse.json()

      if (!status.connected || status.pageCount === 0) {
        console.log('Skipping: Extension not connected')
        return
      }

      // First connection
      const browser1 = await connectToPlaywriter({ port: TEST_PORT, timeout: 30000 })
      expect(browser1.isConnected()).toBe(true)
      const url1 = browser1.contexts()[0].pages()[0].url()
      // Note: We don't call close() or disconnect() as that would close user's tabs
      // The connection will be cleaned up when the Browser object goes out of scope

      // Wait a bit
      await sleep(500)

      // Second connection - should work even with first still "connected"
      const browser2 = await connectToPlaywriter({ port: TEST_PORT, timeout: 30000 })
      expect(browser2.isConnected()).toBe(true)
      const url2 = browser2.contexts()[0].pages()[0].url()

      // Both should have gotten the same page
      expect(url1).toBe(url2)
    }, 70000)
  })

  describe('Direct Playwright Connection', () => {
    it('should work with chromium.connectOverCDP after ensurePersistentRelay', async () => {
      await ensurePersistentRelay({ port: TEST_PORT, timeout: 15000 })

      const statusResponse = await fetch(`http://127.0.0.1:${TEST_PORT}/extension-status`)
      const status = await statusResponse.json()

      if (!status.connected || status.pageCount === 0) {
        console.log('Skipping: Extension not connected')
        return
      }

      // Direct Playwright connection
      const cdpUrl = getCdpUrl({ port: TEST_PORT })
      const browser = await chromium.connectOverCDP(cdpUrl)

      expect(browser.isConnected()).toBe(true)

      const page = browser.contexts()[0].pages()[0]
      const title = await page.title()
      expect(typeof title).toBe('string')

      // Note: Don't call close() - would close user's browser tabs
    }, 35000)
  })
})

