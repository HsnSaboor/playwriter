# Research: Private Workspace Mode (Minimized Worker Window)

## Proposal Summary

Create a dedicated "worker window" that runs minimized/in-background to contain all
automation tabs, keeping them visually separate from user's main browsing.

## Key Findings

### 1. CRITICAL BLOCKER: CDP Freezes When Window is Minimized

**Chromium Issue #40871660** - "CDP commands are frozen when the chrome window is minimized"
- URL: https://issues.chromium.org/issues/40871660
- Status: **Won't Fix (Infeasible)** (closed June 2025)
- Affects: Linux, Windows (not Mac)
- Confirmed Chrome versions: 105+

**What happens:**
- When a Chrome window is manually minimized, CDP commands hang indefinitely
- Mouse movements, tracing, and other commands never complete
- The `--disable-renderer-backgrounding`, `--disable-background-timer-throttling` flags have NO effect

**Workaround mentioned:**
- Enabling `Overlay.enable()` domain prevents the freeze
- This works because it calls `SetNeedsUnbufferedInputForDebugger(true)`
- But this is a hacky workaround, not an official solution

**Official recommendation from Chromium team:**
> "The recommendation is to bring the active tab to front before performing actions 
> that might be throttled."

### 2. chrome.windows.create({ state: 'minimized' }) is Broken

**Multiple reports confirm this doesn't work in Manifest V3:**
- Google Support Thread: https://support.google.com/chrome/thread/166446557
- Chromium Extensions Group: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/xFq0nyunyEQ

**Behavior:**
- Passing `state: 'minimized'` to `chrome.windows.create()` is ignored
- Window opens in normal/active state instead
- Workaround: Create window normally, then call `chrome.windows.update(id, {state: 'minimized'})`

### 3. focused: false Also Unreliable

**Stack Overflow reports:**
- Even setting `focused: false` doesn't consistently work across platforms
- Windows behaves differently than Mac/Linux
- Workaround: Call `chrome.windows.update(id, {focused: false})` after creation

## Alternative Approaches Considered

### A. Offscreen Window (Not Minimized)
Create window positioned off-screen (left: -9999, top: -9999):
- **Problem:** Still has CDP throttling issues as documented in Chromium issue
- Modern Chrome may force windows to remain visible/on-screen

### B. Small Window in Corner
Create tiny window (100x100) in bottom-right corner:
- **Viable:** Would remain visible, avoiding CDP freeze
- **UX issue:** Still visible and can be accidentally focused

### C. Tab Groups in Same Window (Current Approach)
Playwriter already uses `tabGroups` API to group automation tabs:
- **Works well:** No window management complexity
- **No CDP issues:** Tabs in same window remain active
- **Visual separation:** Green "playwriter" group clearly marks automation tabs

### D. Overlay.enable() Workaround
Force-enable Overlay domain to prevent CDP freezing:
- **Hacky:** Depends on implementation detail that could change
- **Side effects:** May affect page rendering/debugging behavior
- **Not documented:** No guarantee this will continue working

## Verdict on Minimized Window: NOT FEASIBLE

The "minimized worker window" approach is **not feasible** due to:

1. **CDP commands freeze** when window is minimized (Chromium bug, won't be fixed)
2. **chrome.windows.create({ state: 'minimized' })** doesn't work
3. Even if minimized worked, **automation would hang**

---

## VIABLE ALTERNATIVE: Visible Separate Window

A **visible** (not minimized) separate window IS feasible and provides good UX.

### Why It Works

| Concern | Status |
|---------|--------|
| CDP freezing | ✅ No issue - window is visible |
| chrome.windows.create() | ✅ Works without `state: 'minimized'` |
| focused: false | ✅ Works (with platform quirks) |

### Implementation Approach

```typescript
let workerWindowId: number | null = null

async function createTabInWorkerWindow(url: string): Promise<chrome.tabs.Tab> {
  if (!workerWindowId) {
    // Create worker window with first tab
    const win = await chrome.windows.create({ 
      url, 
      focused: false,
      width: 1200,
      height: 800
    })
    workerWindowId = win.id!
    return win.tabs![0]
  }
  
  // Verify window still exists (user may have closed it)
  try {
    await chrome.windows.get(workerWindowId)
  } catch {
    workerWindowId = null
    return createTabInWorkerWindow(url) // Self-heal
  }
  
  // Add tab to existing worker window
  return chrome.tabs.create({ 
    windowId: workerWindowId, 
    url, 
    active: false 
  })
}
```

### Configuration Options

**Environment variable (MCP):**
```bash
PLAYWRITER_SEPARATE_WINDOW=1
```

**Programmatic API:**
```typescript
const browser = await connectToPlaywriter({ 
  separateWindow: true 
})
```

### Pros

- Visual isolation from user's browsing
- Easy cleanup (close window = close all automation tabs)
- Can move to second monitor for observation
- Less accidental interaction with automation tabs

### Cons

- Extra taskbar/dock icon
- Potential focus stealing (platform dependent)
- User might close the window (need self-healing logic)
- Slightly more complex than tab groups

### Recommendation

- **Keep tab groups as DEFAULT** - works well, simple, enables collaboration
- **Add separate window as OPT-IN** - for users who want isolation

## References

- Chromium Issue #40871660: https://issues.chromium.org/issues/40871660
- Puppeteer Issue #852: https://github.com/puppeteer/puppeteer/issues/852
- Chrome windows API: https://developer.chrome.com/docs/extensions/reference/api/windows
- chrome.windows.create thread: https://support.google.com/chrome/thread/166446557
