import { createMCPClient } from './mcp-client.js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

function js(strings: TemplateStringsArray, ...values: any[]): string {
    return strings.reduce(
        (result, str, i) => result + str + (values[i] || ''),
        '',
    )
}

async function killProcessOnPort(port: number): Promise<void> {
    try {
        const { stdout } = await execAsync(`lsof -ti:${port}`)
        const pid = stdout.trim()
        if (pid) {
            await execAsync(`kill -9 ${pid}`)
            console.log(`Killed process ${pid} on port ${port}`)
            await new Promise((resolve) => setTimeout(resolve, 500))
        }
    } catch (error) {
        // No process running on port or already killed
    }
}

describe('MCP Server Tests', () => {
    let client: Awaited<ReturnType<typeof createMCPClient>>['client']
    let cleanup: (() => Promise<void>) | null = null

    beforeAll(async () => {
        await killProcessOnPort(19988)
        const result = await createMCPClient()
        client = result.client
        cleanup = result.cleanup
    })

    afterAll(async () => {
        if (cleanup) {
            await cleanup()
            cleanup = null
        }
    })

    it('should execute code and capture console output', async () => {
        await client.callTool({
            name: 'execute',
            arguments: {
                code: js`
          const newPage = await context.newPage();
          state.page = newPage;
          if (!state.pages) state.pages = [];
          state.pages.push(newPage);
        `,
            },
        })

        const result = await client.callTool({
            name: 'execute',
            arguments: {
                code: js`
          await state.page.goto('https://news.ycombinator.com');
          const title = await state.page.title();
          console.log('Page title:', title);
          return { url: state.page.url(), title };
        `,
            },
        })
        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "Console output:
          [log] Page title: Hacker News

          Return value:
          {
            "url": "https://news.ycombinator.com/",
            "title": "Hacker News"
          }",
              "type": "text",
            },
          ]
        `)
        expect(result.content).toBeDefined()
    }, 30000)

    it('should get accessibility snapshot of hacker news', async () => {
        await client.callTool({
            name: 'execute',
            arguments: {
                code: js`
          const newPage = await context.newPage();
          state.page = newPage;
          if (!state.pages) state.pages = [];
          state.pages.push(newPage);
        `,
            },
        })

        const result = await client.callTool({
            name: 'execute',
            arguments: {
                code: js`
          await state.page.goto('https://news.ycombinator.com/item?id=1', { waitUntil: 'networkidle' });
          const snapshot = await state.page._snapshotForAI();
          return snapshot;
        `,
            },
        })

        const initialData =
            typeof result === 'object' && result.content?.[0]?.text
                ? tryJsonParse(result.content[0].text)
                : result
        await expect(initialData).toMatchFileSnapshot(
            'snapshots/hacker-news-initial-accessibility.md',
        )
        expect(result.content).toBeDefined()
        expect(initialData).toContain('table')
        expect(initialData).toContain('Hacker News')
    }, 30000)

    it('should get accessibility snapshot of shadcn UI', async () => {
        await client.callTool({
            name: 'execute',
            arguments: {
                code: js`
          const newPage = await context.newPage();
          state.page = newPage;
          if (!state.pages) state.pages = [];
          state.pages.push(newPage);
        `,
            },
        })

        const snapshot = await client.callTool({
            name: 'execute',
            arguments: {
                code: js`
          await state.page.goto('https://ui.shadcn.com/', { waitUntil: 'networkidle' });
          const snapshot = await state.page._snapshotForAI();
          return snapshot;
        `,
            },
        })

        const data =
            typeof snapshot === 'object' && snapshot.content?.[0]?.text
                ? tryJsonParse(snapshot.content[0].text)
                : snapshot
        await expect(data).toMatchFileSnapshot('snapshots/shadcn-ui-accessibility.md')
        expect(snapshot.content).toBeDefined()
        expect(data).toContain('shadcn')
    }, 30000)

    it('should close all created pages', async () => {
        const result = await client.callTool({
            name: 'execute',
            arguments: {
                code: js`
          if (state.pages && state.pages.length > 0) {
            for (const page of state.pages) {
              await page.close();
            }
            const closedCount = state.pages.length;
            state.pages = [];
            return { closedCount };
          }
          return { closedCount: 0 };
        `,
            },
        })

    })
})
function tryJsonParse(str: string) {
    try {
        return JSON.parse(str)
    } catch {
        return str
    }
}
