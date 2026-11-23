# pocket3d

Publish a 3D model (`.glb`) and get a link anyone can open: an interactive viewer on any phone or computer, with a proper preview card when shared.

```sh
npx -y pocket3d login <api-key>          # create a key at https://pocket3d.co/dashboard/keys
npx -y pocket3d publish model.glb --title "My model" --cover render.png
# https://pocket3d.co/m/3fK9xQ2mLp7Z
```

Changed the model? Publish to the same link: the people you sent it to see the new version, and the earlier ones stay in its history.

```sh
npx -y pocket3d publish model.glb --to https://pocket3d.co/m/3fK9xQ2mLp7Z --note "lower poly count"
```

Made for AI agents like Claude Code: `publish` prints only the link on stdout (or one JSON object with `--json`), errors go to stderr with exit code 1, so an agent can run it and hand you the result.

```sh
pocket3d skill                           # install the agent skill for Claude Code (~/.claude/skills/pocket3d)
pocket3d skill --print                   # the same instructions, for any other agent
```

## Commands

```
pocket3d publish <model.glb> [--title "My model"] [--cover cover.png] [--note "..."] [--json]
pocket3d publish <model.glb> --to <id-or-link> [--note "what changed"] [--draft] [--json]
pocket3d versions <id-or-link> [--json]
pocket3d live <id-or-link> <version>           # which version the link shows (roll back)
pocket3d publish-draft <id-or-link> <version> [--live]
pocket3d list [--page N] [--json]
pocket3d rename <id-or-link> "New title"
pocket3d delete <id-or-link> [--version N]
pocket3d login <api-key>                 # pocket3d.co
pocket3d login <url> <api-key>           # a self-hosted instance
pocket3d whoami
pocket3d skill [--print] [--dir <path>]
```

- Models: binary glTF, up to 95 MB (Draco / Meshopt compression supported).
- Cover: PNG, JPEG or WebP, up to 5 MB.
- Versions: `--to` adds a version that goes live at once on the same link; `<link>?v=3` keeps showing v3. `--draft` keeps it private (stdout is its preview link in your dashboard) until `publish-draft`. A version is `3` or `v3`.
- `login` checks the key before saving it (`~/.config/pocket3d/config.json`, mode 0600); `POCKET3D_URL` and `POCKET3D_API_KEY` override the saved login.
- No runtime dependencies; Node 20 or later.

pocket3d also has an MCP server (`https://pocket3d.co/mcp`) for Claude.ai, Claude Desktop, Cursor and Codex.

License: AGPL-3.0.
