---
title: Getting Started with Playwriter
description: Setup and connection guide for Playwright developers
---

# Getting Started with Playwriter

## Prerequisites

1. **Google Chrome** installed.
2. **Node.js** installed (v18+).
3. **Playwriter Extension** installed from the [Chrome Web Store](https://chromewebstore.google.com/detail/playwriter-mcp/jfeammnjpkecdekppnclgkkffahnhfhe).

## Installation

Install the `playwriter` package in your project:

```bash
npm install playwriter playwright-core
# or
pnpm add playwriter playwright-core
```

## connecting to Chrome

### 1. One-Liner (Recommended)

The easiest way to connect. This function starts the local relay server if needed and waits for the extension to connect.

```typescript
import { connectToPlaywriter } from 'playwriter'

const browser = await connectToPlaywriter()
// Now use 'browser' just like a standard Playwright browser instance
```

**Before running:**
1. Ensure the Playwriter extension is installed.
2. Click the extension icon on any tab (it turns green).

### 2. Persistent Server (For CLI Tools/Agents)

If you're building a tool that runs repeatedly, you might want to keep the server running in the background.

**Step 1: Start the server**
```bash
npx -y playwriter serve
```

**Step 2: Connect in your code**
```typescript
import { chromium } from 'playwright-core'

// Connects instantly to the running server
const browser = await chromium.connectOverCDP('http://127.0.0.1:19988')
```

## Basic Automation Workflow

Once connected, the workflow is identical to standard Playwright, with one key rule: **Never close the browser.**

```typescript
import { connectToPlaywriter } from 'playwriter'

async function run() {
  const browser = await connectToPlaywriter()
  const context = browser.contexts()[0]
  
  // Use existing tab
  const page = context.pages()[0]
  
  // Or create new one (see Separate Window Mode docs)
  // const page = await context.newPage()

  await page.goto('https://github.com/login')
  
  // Standard locators work
  await page.fill('#login_field', 'myuser')
  await page.fill('#password', 'mypass')
  await page.click('input[type="submit"]')
  
  console.log('Logged in!')
  
  // ⚠️ IMPORTANT: Do NOT call browser.close()
  // It would close the connection to your actual Chrome browser
  // browser.close() -> DON'T DO THIS
  
  // Instead, just exit your process
  process.exit(0)
}

run()
```

## Troubleshooting Connection

- **Extension Icon is Gray:** You haven't connected yet. Click it to turn it green.
- **Connection Timeout:** Ensure no other process is using port 19988.
- **"Extension not connected" Error:** The relay server is running, but the Chrome extension hasn't connected to it yet. Click the icon.
