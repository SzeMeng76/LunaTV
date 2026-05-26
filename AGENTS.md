# AGENTS.md

## Project overview

LunaTV is a Next.js 16 + React 19 + TypeScript video aggregation platform. Chinese-language UI and docs.

## Prerequisites

- Node v20.10.0 (see `.nvmrc`)
- pnpm 10.14.0 (declared in `packageManager` field)

## Commands

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` (auto-runs `gen:manifest` first) |
| Build | `pnpm build` (auto-runs `gen:manifest` first) |
| Lint | `pnpm lint` (next lint) |
| Lint strict | `pnpm lint:strict` (zero warnings allowed) |
| Lint + fix | `pnpm lint:fix` (eslint fix + prettier) |
| Typecheck | `pnpm typecheck` |
| Format | `pnpm format` |
| Format check | `pnpm format:check` |
| Test | `pnpm test` (jest, jsdom) |
| Test watch | `pnpm test:watch` |
| Generate manifest | `pnpm gen:manifest` (creates `public/manifest.json` from env `NEXT_PUBLIC_SITE_NAME`) |

**Verification order**: `pnpm lint:strict && pnpm typecheck && pnpm test`

## Architecture

```
src/
  app/          # Next.js App Router pages + API routes
    api/        # ~50 API route directories (REST endpoints)
    play/       # Video player page
    search/     # Search page
    douban/     # Douban integration
    emby/       # Emby integration
    watch-room/ # Multi-user watch rooms (WebRTC)
    shortdrama/ # Short drama feature
    live/       # IPTV live streaming
    ...
  components/   # React components (80+ files)
  hooks/        # Custom React hooks (26 files), mostly TanStack Query wrappers
  lib/          # Core business logic, DB clients, caching, integrations
  contexts/     # React contexts (DownloadContext, GlobalCacheContext)
  workers/      # Web Workers
  styles/       # Additional CSS
  types/        # Type declarations
```

### Key patterns

- **Path aliases**: `@/*` → `./src/*`, `~/*` → `./public/*`
- **State management**: TanStack Query (react-query) for all server state; React contexts for global UI state
- **Storage backends**: localStorage (default), Upstash Redis, Kvrocks — selected via `NEXT_PUBLIC_STORAGE_TYPE` env var
- **Runtime config**: Layout injects `window.RUNTIME_CONFIG` via inline `<script>` — client components read from this global
- **Manifest generation**: `scripts/generate-manifest.js` must run before dev/build (both `dev` and `build` scripts do this automatically)
- **Docker entrypoint**: `start.js` — runs manifest generation, starts standalone server, polls `/login`, then runs `/api/cron` hourly
- **Production output**: `standalone` mode (set in `next.config.js` when `NODE_ENV=production`)

## TypeScript

- `strict: true` in tsconfig but `strictNullChecks: false` and `noImplicitAny: false` — do not enable these without team discussion
- Prefer explicit types over `any`, but `any` is not blocked by lint

## Styling

- Tailwind CSS v4 — most theme config lives in `src/app/globals.css` via `@theme`, not in `tailwind.config.mjs`
- Prettier plugin `prettier-plugin-tailwindcss` auto-sorts Tailwind classes

## Code style

- Prettier: single quotes, JSX single quotes, 2-space tabs, semicolons, arrow parens always
- ESLint flat config (`eslint.config.mjs`): extends `next/core-web-vitals` + `prettier`
- `no-console: warn` — avoid adding new `console.log`; existing ones are warnings, not errors
- **Import order** (enforced by `simple-import-sort`): bare modules → CSS → `@/lib`, `@/hooks` → `@/data` → `@/components`, `@/container` → `@/store` → `@/` → relative → `@/types` → rest
- Unused imports are removed by `unused-imports` plugin
- Prefix unused variables/args with `_` to suppress warnings

## Commits

- Conventional commits enforced by commitlint: `feat`, `fix`, `docs`, `chore`, `style`, `refactor`, `ci`, `test`, `perf`, `revert`, `vercel`
- Pre-commit hook runs `lint-staged`: ESLint (max 0 warnings) + Prettier on staged JS/TS/CSS/MD files

## Testing

- Jest with `jest-environment-jsdom`
- Setup file: `jest.setup.js` (extends jest-dom, mocks `next/router` via `next-router-mock`)
- Module aliases mapped in `jest.config.js` matching tsconfig paths
- No test files currently exist — tests go in `src/` as `*.test.ts` or `*.test.tsx`

## Gotchas

- `reactStrictMode: false` in next.config.js — this is intentional
- Image optimization is disabled (`images.unoptimized: true`) — required for proxied images
- Next.js 16 uses Turbopack by default; SVGs are handled via `@svgr/webpack` in turbopack config
- `layout.tsx` is `force-dynamic` — calls `cookies()` to prevent Docker caching issues
- CI builds Docker images for both `linux/amd64` and `linux/arm64`; version tags are auto-created from `package.json` version
- `.prettierignore`, `.dockerignore`, `.gitignore` exist — respect them
