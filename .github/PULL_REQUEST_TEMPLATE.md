## What was wrong

<!-- One or two sentences. A number that was wrong, a screen that broke, a path that failed. -->

## What changed

<!-- The change, and why this shape rather than another. -->

## How it was verified

<!-- Commands you ran and what they returned. Local gate, deployed smoke test, or browser check with a width. -->

## Checklist

- [ ] `bash scripts/check.sh` passes (typecheck, build, design detector, tests)
- [ ] Money stays an integer in rupiah; no float was introduced
- [ ] D1 access goes through `src/lib/server/repos/` with Drizzle
- [ ] Bindings are read inside the request from `event.locals.env`, not at module scope
- [ ] Migration included and safe to run twice, if the schema changed
- [ ] UI changes: screenshot at 390 px, light and dark, touch targets at least 44 px, contrast at least 4.5:1
- [ ] No secrets, personal data, or real financial records in the diff
