# Contributing

Thanks for helping improve recovery-trail. The project is a local-first,
health-adjacent decision-support tool, so correctness, privacy, and careful
public claims matter as much as presentation.

## Set up

Use Node.js 22 or newer:

```bash
npm ci
npx playwright install chromium
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm run dev` starts the app at `http://localhost:5173`.

## Ground rules

- Never commit or attach a real Apple Health export. Add only synthetic,
  minimal fixtures that cannot identify a person.
- Keep file parsing and reasoning client-side. A change that adds a backend,
  analytics, tracking, or third-party runtime requests requires an explicit
  architecture and privacy discussion first.
- Add tests for parser, date-bucketing, aggregation, or rule changes. Update the
  golden fixture when the intended recommendation changes.
- Support health or training claims with primary literature and preserve the
  decision-support disclaimer. Do not present heuristics as diagnosis or
  personal prescription.
- Keep keyboard navigation and `prefers-reduced-motion` behavior working.

## UI and documentation changes

The README media is generated from the synthetic sample journey:

```bash
npm run build
npm run screenshots:update
```

Commit refreshed images when a visible briefing change makes the existing
screenshots inaccurate.

## Pull requests

Describe the behavior change, its privacy or methodology impact, and the checks
you ran. Keep unrelated cleanup out of the same pull request. By contributing,
you agree that your work is licensed under the repository's MIT license.
