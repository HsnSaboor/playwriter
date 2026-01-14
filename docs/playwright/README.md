---
title: Playwriter for Playwright Users
description: Comprehensive guide to using Playwriter with the Playwright API
---

# Playwriter for Playwright Users

Playwriter allows you to use the standard [Playwright API](https://playwright.dev/) to control your existing Chrome browser via an extension. This means you can run your Playwright scripts against your daily driver browser, complete with your cookies, extensions, and logged-in sessions.

## Key Differences from Standard Playwright

| Feature | Standard Playwright | Playwriter |
|---------|---------------------|------------|
| **Browser** | Launches new headless/headed binary | Connects to your running Chrome |
| **Context** | Fresh profile every time | Your existing profile (cookies, history) |
| **Extensions** | None by default | Supports your installed extensions |
| **Detection** | Often flagged as bot | Harder to detect (looks like human) |
| **Connection** | Launches child process | Connects via local WebSocket |

## Documentation Sections

- [**Getting Started**](./getting-started.md) - Installation and basic connection patterns.
- [**Separate Window Mode**](./separate-window-mode.md) - Using the dedicated automation window to keep your workspace clean.
- [**Cookies & Network**](./cookies-and-network.md) - How cookie management works (special workaround) and network interception.
- [**Limitations & Workarounds**](./limitations-and-workarounds.md) - Known limitations (permissions, context methods) and how to handle them.

## Quick Example

```typescript
import { connectToPlaywriter } from 'playwriter'

// Connects to your running Chrome via the extension
const browser = await connectToPlaywriter()
const context = browser.contexts()[0]
const page = context.pages()[0]

// Use standard Playwright API
await page.goto('https://github.com')
console.log(await page.title())
```
