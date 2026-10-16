# Sequential completion and multiple Chrome profiles

Request: wait for openUrl/click completion before the next action; control multiple Chrome profiles from the dashboard.

Evidence: agent advances openUrl after spawn, click sleeps 400 ms, and all profiles share one workflow and tab identity.

Expected: profile-specific runs and extension identity, navigation completion owned by the background worker, configurable post-action element conditions for asynchronous pages, bounded timeouts and regression tests using isolated Chrome.

Status: complete (2026-10-16, Asia/Bangkok).

Implemented: independent per-profile workflows and target tabs; Chrome profile discovery/open controls; extension Options identity mapping; background-owned navigation acknowledgement; DOM readiness and explicit result conditions; cancellation, stale-result rejection, and bounded action leases.

Verification: npm test passed for workflow isolation, real HTTP endpoints, dialog/upload, isolated Chrome navigation/redirect/SPA/delayed navigation, dashboard profile selection and completion persistence, and file-picker regression. node --check passed for all changed JavaScript and the dashboard inline script; git diff --check passed. Test temporary files/npm cache used ignored test-results/runtime on D: because C: had no free space. No logged-in Chrome profile was used.
