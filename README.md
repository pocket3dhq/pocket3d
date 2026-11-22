<h1 align="center">pocket3d</h1>

<p align="center">
<a href="https://opensource.org/license/agpl-v3"><img src="https://img.shields.io/badge/License-AGPL%203.0-blue.svg" alt="License"></a>
</p>

<div align="center">
  <strong>
    Publish a 3D model from your terminal or your AI agent. Get a link anyone can open.
  </strong>
  <br /><br />
  Use <a href="https://pocket3d.co">pocket3d.co</a>, or self-host it with one <code>docker compose up</code>.
</div>

<br />

```sh
$ npx pocket3d publish snake_way.glb --title "Snake Way" --cover hero.png
https://pocket3d.co/m/3fK9xQ2mLp7Z
```

The link opens an interactive viewer (drag to orbit, pinch to zoom) on any phone or computer, and shows a proper preview card when you paste it into X, Discord, Slack or iMessage. It also embeds anywhere:

```html
<iframe src="https://pocket3d.co/m/3fK9xQ2mLp7Z" width="800" height="500" style="border:0"></iframe>
```

## With your AI agent

pocket3d is made for models built by agents (Claude Code + Blender, Codex, Cursor, Claude.ai, or AI 3D generators). Open **Dashboard → Connect** for the exact line for your agent. There are two ways in, and they share one account:

**CLI + skill** (coding agents, files on your machine):

```sh
npx -y pocket3d login <api-key> && npx -y pocket3d skill   # once; the skill teaches Claude Code to publish
```

`publish` prints **only the link** on stdout (or one JSON object with `--json`) and fails loudly on stderr, so an agent can run it and hand you the result. `npx pocket3d skill --print` prints the same instructions for other agents.

**MCP server** at `https://pocket3d.co/mcp` (streamable HTTP; OAuth sign-in, or an API key as `Authorization: Bearer <key>`):

```sh
claude mcp add --transport http pocket3d https://pocket3d.co/mcp   # Claude Code
```

In Claude.ai / Claude Desktop: Settings → Connectors → Add custom connector → `https://pocket3d.co/mcp`. Tools: `whoami`, `list_models`, `rename_model`, `delete_model`, `publish_from_url` (a `.glb` already on the web, e.g. a 3D generator's output) and `create_upload_link`. An MCP tool can't carry a local file, so `create_upload_link` returns a single-use URL (10 minutes, one model) and the curl command that uploads the file through it.

Agents told only "use pocket3d" can read `/llms.txt` on any instance.

## CLI

Sign up at [pocket3d.co](https://pocket3d.co/auth/register) (or your own instance), create an API key at `/dashboard/keys` (one per machine or agent, revocable any time), then:

```sh
npx -y pocket3d login <api-key>                 # pocket3d.co; self-hosted: login <url> <api-key>
npx -y pocket3d whoami                          # which account the key publishes to
npx -y pocket3d publish model.glb [--title "My model"] [--cover cover.png] [--json]
npx -y pocket3d list [--json]                   # your models, newest first
npx -y pocket3d rename <id-or-link> "New title"
npx -y pocket3d delete <id-or-link>
npx -y pocket3d skill [--print]                 # install the agent skill
```

- Node 20+. `npm i -g pocket3d` works too.
- Models: binary glTF (`.glb`), up to 95 MB. Draco and Meshopt compression are supported.
- Cover: PNG, JPEG or WebP, up to 5 MB, used for link previews.
- `POCKET3D_URL` / `POCKET3D_API_KEY` override the saved login (handy in CI).
- The dashboard lists your models (rename, delete), your keys and the apps connected through OAuth.

## Accounts

Email + password accounts: signing up creates a user and its own organization, which owns the models and the API keys.

- Keys look like `p3d_…`, are shown once, and only their SHA-256 is stored. Revoking one stops it at once.
- The browser session is an httpOnly `SameSite=Lax` cookie backed by the database: logging out, changing the password or resetting it ends sessions for real.
- `DISABLE_REGISTRATION=true` closes signup, except for the very first account (for private self-hosts; pocket3d.co keeps signup open).
- `MAX_STORAGE_PER_ORG_MB` caps what one account keeps stored (models + covers); unset means unlimited. The dashboard shows what's used.
- Email is optional. With `RESEND_API_KEY` (plus `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME`), signup needs an activation link and "forgot password" works; without it accounts are active at once.
- Rate limits (in memory, a refused call answers 429): `/auth` per IP and per email; the public API and MCP per account (per 15 minutes: 60 publishes, 20 downloads from a URL, 600 of each other call and 900 MCP requests; at most 3 downloads at a time); upload links per IP.

## API

With your API key in the `Authorization` header (`<key>` or `Bearer <key>`):

- `POST /api/public/v1/assets`: `multipart/form-data` fields `file`, `cover` (optional) and `title` (optional). Returns `{ id, url, path, coverPath, ... }`.
- `POST /api/public/v1/assets/from-url`: JSON `{ url, coverUrl?, title? }`; the server downloads a public `.glb` (private and local addresses are refused).
- `GET /api/public/v1/assets?page=`, `PUT /api/public/v1/assets/:id` (`{ title }`), `DELETE /api/public/v1/assets/:id`.
- `GET /api/public/v1/me` tells whose key it is.

The full reference is at `/api/docs` on any instance.

```sh
curl -H "Authorization: $POCKET3D_API_KEY" -F file=@model.glb -F title="My model" https://pocket3d.co/api/public/v1/assets
```

## Self-hosting

```sh
git clone https://github.com/pocket3dhq/pocket3d.git && cd pocket3d
docker compose up -d --build
# → http://localhost:4007: sign up, create a key at /dashboard/keys,
#   then: npx -y pocket3d login http://localhost:4007 <key>
#   MCP: http://localhost:4007/mcp
```

One container runs everything (nginx + the API + the web app) next to Postgres. Files stay on a local volume, or set `STORAGE_PROVIDER=cloudflare` to serve them from an R2 bucket through Cloudflare's CDN. Set `MAIN_URL` to the address people will open, and `DISABLE_REGISTRATION: 'true'` once your own account exists if the instance is just for you. All settings are in [`docker-compose.yaml`](docker-compose.yaml) and [`.env.example`](.env.example).

| | pocket3d.co | Self-hosted |
|---|---|---|
| **Cost** | Hosted for you | Free forever (AGPL-3.0); you pay for your own server |
| **Setup** | `pocket3d login` and publish | `docker compose up` on any machine with Docker |
| **Files** | Cloudflare R2 + CDN | Local disk or your own R2 bucket |
| **Limits** | 95 MB per model | 95 MB per model (raise it in the code if you don't sit behind Cloudflare) |
| **Updates & backups** | Managed | Your responsibility |
| **Source** | Same code | Fork and change anything |

## Development

```sh
pnpm install                      # Node 22, pnpm only
cp .env.example .env              # set an absolute UPLOAD_DIRECTORY
pnpm dev:docker                   # Postgres on 127.0.0.1:5439
pnpm prisma-migrate-deploy
pnpm dev                          # API on :3000, web on :4200 (MAIN_URL)
pnpm test                         # unit tests (+ the CLI against a fake server)
pnpm test:e2e                     # the real API against a throwaway "pocket3d-test" database
scripts/smoke.sh http://localhost:4200   # signs up a throwaway account, checks everything, deletes it
```

Stack: pnpm workspaces · NestJS · Next.js (React) · Prisma (PostgreSQL) · three.js. See [CLAUDE.md](CLAUDE.md) for how the code is laid out.

## License

[AGPL-3.0](LICENSE). If you run a modified pocket3d for others, publish your changes.
