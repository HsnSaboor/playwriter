# Tasks: Private Workspace Mode (Minimized Window)

## Status: CANCELLED - NOT FEASIBLE

This feature has been rejected due to fundamental Chromium limitations.
See `docs/research-private-workspace.md` for full analysis.

**Replacement feature:** See `tasks/separate-window.md` for the approved 
"Visible Separate Window" feature which achieves similar goals without 
the CDP freeze issues.

---

## Blocking Issues Discovered

### 1. CDP Freezes When Window is Minimized
- **Chromium Issue:** https://issues.chromium.org/issues/40871660
- **Status:** Won't Fix (Infeasible) - closed June 2025
- When a window is minimized, CDP commands hang indefinitely
- No workaround available that's reliable

### 2. chrome.windows.create({ state: 'minimized' }) Broken
- The Manifest V3 API ignores the `state: 'minimized'` parameter
- Windows always open in normal/focused state

### 3. Even Workarounds Fail
- Creating window then calling `chrome.windows.update(id, {state: 'minimized'})` 
  would still trigger the CDP freeze issue

---

## Original Proposed Tasks (Now Cancelled)

These tasks were planned before discovering the blocking issues:

### ~~Task 1: Add `chrome.windows` Permission~~
Add "windows" permission to manifest.json

### ~~Task 2: Implement Worker Window State~~
Track `workerWindowId` in extension state

### ~~Task 3: Modify Tab Creation to Use Worker Window~~
Update `chrome.tabs.create()` calls to specify `windowId`

### ~~Task 4: Add Window Lifecycle Management~~
Handle window closed by user, cleanup on disconnect

### ~~Task 5: Add Server Command for Window Control~~
Add `createWorkerWindow` and `closeWorkerWindow` commands

---

## Alternative Recommendations

For users wanting visual isolation from automation tabs:

1. **OS Virtual Desktops** - Move Chrome to separate desktop (no code changes)
2. **Separate Chrome Profile** - Launch Chrome with `--user-data-dir`
3. **Headless Mode** - Use `--headless=new` for CI/automation
4. **Enhanced Tab Groups** - Could add auto-collapse feature (minor improvement)

---

## Research Document

Full analysis: `docs/research-private-workspace.md`
