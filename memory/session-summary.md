# Session Summary: Separate Window Mode Feature

**Date:** 2026-01-14
**Feature:** Private Workspace / Separate Window Mode

## Key Decisions

### REJECTED: Minimized Worker Window
- **Reason:** CDP commands freeze when Chrome window is minimized
- **Chromium Issue:** #40871660 - marked "Won't Fix (Infeasible)"
- **Also broken:** `chrome.windows.create({ state: 'minimized' })` ignored in MV3

### APPROVED: Visible Separate Window (Opt-in)
- Creates automation tabs in a dedicated visible window
- Provides visual isolation without CDP freeze issues
- Configurable via `PLAYWRITER_SEPARATE_WINDOW` env var or `separateWindow` option

## Files Created/Updated

### Research
- `docs/research-private-workspace.md` - Full analysis of both approaches

### Specs
- `specs/features.md` - Added REJECTED + APPROVED sections
- `specs/api.md` - Added `separateWindow` option to APIs

### Tasks
- `tasks/private-workspace.md` - Cancelled (minimized approach)
- `tasks/separate-window.md` - 12 implementation tasks (~4.5 hours total)

### Memory
- `memory/structure-map.md` - Codebase structure analysis

## Implementation Summary

12 tasks covering:
1. Extension state types
2. Handle setWindowMode message
3. createTabInWorkerWindow function
4. Modify tab creation points
5. Disable tab groups in separate window mode
6. Close window on disconnect
7. Relay server option
8. Persistent relay options
9. Environment variable support
10. Integration tests
11. README documentation
12. Changelog

## Technical Notes

- Extension currently uses `chrome.tabs.*` only, no `chrome.windows.*`
- Tab creation happens in 2 places: `createInitialTab` and `Target.createTarget`
- Tab groups handled by `syncTabGroup()` function
- State managed via zustand store

## Next Steps

Ready for implementation. Start with extension changes (Tasks 1-6), then
server changes (Tasks 7-9), then tests and docs (Tasks 10-12).
