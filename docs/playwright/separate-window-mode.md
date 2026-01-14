---
title: Separate Window Mode
description: Keeping your main browser window clean while automating
---

# Separate Window Mode

By default, when you automate tabs with Playwriter, they live alongside your personal tabs in your main browser window. This can be cluttered and confusing.

**Separate Window Mode** solves this by moving all automation tabs to a dedicated, visible Chrome window.

## How It Works

1. You click the extension icon on a tab in your main window.
2. Playwriter **moves** that tab to a new "Worker Window".
3. A placeholder tab (`chrome://newtab`) is created in your main window so it doesn't close.
4. All subsequent automation tabs (via `newPage()`) open in this Worker Window.
5. The Worker Window has a **green "playwriter" tab group** header for easy identification.

## Enabling Separate Window Mode

### Option 1: Environment Variable (Recommended)

Set `PLAYWRITER_SEPARATE_WINDOW=1` in your environment.

```bash
PLAYWRITER_SEPARATE_WINDOW=1 node my-script.js
```

Or in your `.env` file:
```bash
PLAYWRITER_SEPARATE_WINDOW=1
```

### Option 2: Programmatic (One-Liner)

Pass the option to `connectToPlaywriter`:

```typescript
import { connectToPlaywriter } from 'playwriter'

const browser = await connectToPlaywriter({ 
  separateWindow: true 
})
```

### Option 3: Persistent Server Flag

If running the server manually:

```bash
npx playwriter serve --separate-window
# OR
PLAYWRITER_SEPARATE_WINDOW=1 npx playwriter serve
```

## Behavior Details

- **Visual Cues:** The worker window creates a tab group named "playwriter" colored **green**. This makes it instantly recognizable.
- **Smart Management:** 
  - If you close the worker window manually, Playwriter will create a new one for the next tab.
  - When the last tab in the worker window is closed, the window closes automatically (standard Chrome behavior).
- **Existing Tabs:** If you connect a tab that is already open, it will be **moved** to the worker window. Be aware of this if you are organizing your tabs manually.

## Why Use It?

- **Clean Workspace:** Keeps your personal browsing separate from automation chaos.
- **Visual Feedback:** You can see exactly what the bot is doing in a side window without it stealing focus from your main work (unless `page.bringToFront()` is called).
- **Safety:** Prevents accidental interactions with your personal tabs.
