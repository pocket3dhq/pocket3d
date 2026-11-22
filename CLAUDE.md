pocket3d: publish a 3D model (.glb) from the terminal or an AI agent and get a link anyone can open (an interactive three.js viewer with link-preview tags).

This project is a monorepo with a root-only package.json of dependencies, made with pnpm.

- apps/backend: the API (NestJS). Controllers, auth middleware and `main.ts` only. Also the MCP endpoint (`src/mcp`, served at `MAIN_URL/mcp`) and the OAuth endpoints for MCP connectors (`/oauth/*`, `/.well-known/oauth-*`).
- apps/frontend: the web app (Next.js 16, React). Home page, viewer page `/m/[id]`, `/auth/*` (signup, login, emailed links), `/dashboard` (models, Connect: agent setup + API keys + connected apps, settings), the OAuth consent page `/oauth/authorize`, `/llms.txt` and `/skill.md`, dev uploads route.
- apps/cli: the `pocket3d` npm package (tsup bundle, zero runtime dependencies). It's the only package with its own dependencies. Commands: publish (`--json`), list, rename, delete, login, whoami, skill.
- libraries/nestjs-libraries: server logic shared by the backend: Prisma (`database/prisma/<domain>/{repository,service}`), DTOs (`dtos/<domain>`), storage (`upload/`), the MCP tools (`mcp/mcp.service.ts`), helpers (`services/`).
- libraries/helpers: small helpers used by both sides (configuration checker, swagger, `internalFetch`), and `agent/skill.ts`: the one source of the agent instructions (CLI `skill`, `/skill.md`, `/llms.txt`).

## Rules

- Use only pnpm. Lint, typecheck and test from the root: `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit), `pnpm test:e2e` (needs `pnpm dev:docker`; uses its own `pocket3d-test` database). Unit specs sit next to the code (`*.spec.ts`), e2e specs in `apps/backend/test`.
- Backend layers, no shortcuts: **DTO >> Controller >> Service >> Repository**. Most server logic belongs in `libraries/nestjs-libraries`; the backend app holds controllers.
- Never raw SQL, always Prisma. Schema changes need a migration (`pnpm prisma-migrate-dev --name <change>`), committed; the image applies them with `prisma migrate deploy` at start.
- Repositories `select` only the fields the caller returns. Storage keys (`name`, `coverName`) never leave the server.
- Uploads go through `MulterStreamEngine` + `ASSET_UPLOAD_RULES`: the real type is sniffed from the first bytes and the size cap is enforced mid-stream. Never trust the client's mime type or file name.
- Storage is generic (`IUploadProvider`, `UploadFactory`): nothing outside `upload/` may know whether files are local or on R2.
- Share ids are `makeId(12)` (crypto random). Treat the link as the only permission on a model.
- The server fetches a URL only through `upload/remote.fetch.ts` (public addresses only, connection pinned to the checked IP, redirects re-checked, then the same sniff + size cap as uploads). Never `fetch()` a user-supplied URL anywhere else.
- Auth: the dashboard API sits behind `AuthMiddleware` (the `p3d_session` cookie, JSON-only bodies), the public API behind `PublicAuthMiddleware` (an org's API key), `/mcp` behind `McpAuthMiddleware` (an OAuth access token `p3d_oat_…` or an API key), upload links behind `UploadTicketGuard` (a single-use `p3d_up_…` token, 10 minutes). Sessions, API keys, emailed tokens, OAuth codes/tokens/client secrets and upload tickets are stored as SHA-256 hashes only, passwords as scrypt; none of them, nor password hashes, ever leave the server. OAuth is PKCE (S256) only, codes are single use, refresh tokens rotate. Deleting an account revokes keys, OAuth grants and upload tickets. Every query on org-owned data (assets, keys) is scoped by `organizationId` from `@GetOrgFromRequest()`, never by an id from the body.
- pocket3d.co is the cloud version of the same code (open signup, `MAX_STORAGE_PER_ORG_MB`); self-host-only behaviour (like `DISABLE_REGISTRATION`'s first-account exception) must never decide who owns data. Models without an owner (published before accounts) are never given one by the app.
- Keep `.env.example` and `docker-compose.yaml` updated when adding an env var (and tell the maintainer, so pocket3d.co's private deploy config gets it too).
- Frontend: before writing Next.js code, read `apps/frontend/AGENTS.md` (Next 16 differs from older versions; docs in `node_modules/next/dist/docs/`). Colours come from the CSS variables in `apps/frontend/src/app/colors.scss` through Tailwind names (`bg-bg`, `text-textMuted`...), never hard-coded hex. Write native components, don't install UI kits.
- If the frontend ever fetches client-side: SWR, one hook per request, following react-hooks/rules-of-hooks.
- `apps/frontend/src/components/viewer/model.viewer.tsx` must keep `NoToneMapping` + sRGB output: unlit / baked-colour models (cel looks) must render exactly as authored.
- New features start in `ROADMAP.md` (gitignored, local only: never commit it). The MVP is: publish → link → viewer → preview → self-host.
- When you finish, run `scripts/smoke.sh <url> [api-key]` against what you changed (dev: `scripts/smoke.sh http://localhost:4200`, which signs up and deletes a throwaway account; signup is limited to 5 per hour per IP).

## Releases

The repo is public (AGPL-3.0) at https://github.com/pocket3dhq/pocket3d and holds only what self-hosters and contributors need: no server addresses, ssh users, secrets, certificates or pocket3d.co deploy files (those live in a separate private repo). The `pocket3d` CLI is published to npm: bump `apps/cli/package.json`, `pnpm build:cli`, check `npm pack --dry-run` in `apps/cli`, and ask the maintainer before each `npm publish`.
