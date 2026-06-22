# Task 8 — NotificationList component

**Status:** COMPLETED

**File created:** `src/components/users/NotificationList.tsx`

**tsc:** `npx tsc --noEmit` — passed, no errors.

**Commit:** `135f995` — `feat: add NotificationList component with pagination and date grouping`

---

## Fix round: review findings

**Bug 1 (medium) — loadMore race condition:** Added `loadingMore` boolean state. `loadMore` early-returns when already fetching. "Carica altre" button gets `disabled` prop while loading. Offset only advanced on successful fetch.

**Bug 2 (high) — silent API errors:** Added `error` state. `fetchPage` sets error message on `!res.ok` instead of silently returning. Error banner rendered below the header bar and above the empty state.

**Bug 3 (medium) — markAllRead without rollback:** Optimistic update (`setNotifs`) moved after `res.ok` check. If PATCH fails, state is untouched.

**Bug 4 (low) — unused `Link` import:** Already absent from file; no action needed.

**Bug 5 (low) — useEffect cleanup:** Added `cancelled` flag in effect with cleanup that sets it to `true`. `finally` callback guards `setLoading` against unmounted component.

**tsc:** `npx tsc --noEmit` — passed, no errors.

**Commit:** `fix: address review findings in NotificationList`
