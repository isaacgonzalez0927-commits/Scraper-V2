# AGENTS.md

## Cursor Cloud specific instructions

Sere is a single **Next.js 15** app (App Router, React 19, TypeScript). There is one
service to run — the Next.js server. Standard commands live in `package.json` and the
[README](README.md); prefer those over duplicating here.

### Running locally
- Dev server: `npm run dev` (serves on `http://localhost:3000`). The update script has
  already run `npm install`, so no dependency install is needed on startup.
- No environment variables are required for local development. The app defaults to a
  local SQLite database at `./data/sere.db` (git-ignored) and auto-creates + seeds it on
  first request.

### Demo / hello-world flow (no login required)
- Visit `/demo` to be auto-signed into the seeded demo company **Harbor Air** and land on
  `/overview`. This is a real signed-in session on real seeded data, so changes persist
  until the DB is reseeded.
- A normal login also works: `owner@sere.cash` / `harborair`.
- To reset all data, stop the dev server and delete `./data/sere.db`; it will be
  recreated and reseeded on the next request.

### Lint / test / build
- Lint: there is no ESLint config or `lint` script. The equivalent static check is
  `npx tsc --noEmit` (TypeScript is strict).
- Test: `npm test` (runs `tsx --test` over the files listed in `package.json`; ~48 unit
  tests, no server or DB service required).
- Build: `npm run build` (`next build`).

### Notes / gotchas
- `@libsql/client`/`libsql` are configured as `serverExternalPackages` in
  `next.config.ts`; they are native-ish and must stay external — do not bundle them.
- Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`) is only for production; leave unset
  locally to use the file-backed SQLite DB.
- Optional integrations (Stripe, Square, PayPal, Resend email, OpenAI assistant) are all
  off unless their keys are provided; the core app runs fully without them.
