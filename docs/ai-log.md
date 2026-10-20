# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:** The Build 2 prompt from docs/build-2.md, with README.md, user-stories.md, build-2.md and the Build 1 files in src/domain/. It asked for a hand-written merge sort, publishEvent, listEventSummaries, search/filter/sort functions, and tests for every acceptance criterion.
- **What came back:** sorting.js (merge sort), eventSearch.js (filterEvents, sortEvents, searchEvents), publishEvent and listEventSummaries added to inventory.js, a test file with 37 tests, and an npm test script. All 37 tests pass.
- **What was wrong (or "nothing"):** Nothing broke, but I checked three things myself. (1) sorting.js never calls the built-in .sort(; I searched the file with grep and found nothing. (2) mergeSort copies the list with items.slice(), so the original is never changed. (3) A date-only "to" filter includes the whole day (DAY_MS - 1). The prompt did not ask for unpublishEvent, so it was not written even though S04 says "publish and unpublish".

### Prompt 2:
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**
