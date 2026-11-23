// What an AI agent needs to know to publish with pocket3d. One source for
// three places: `pocket3d skill` (SKILL.md for Claude Code and other agents),
// MAIN_URL/skill.md and MAIN_URL/llms.txt. The URL is filled in, so a
// self-hosted instance hands out instructions for itself

export const CLOUD_URL = 'https://pocket3d.co';

const clean = (url: string) => (url || CLOUD_URL).replace(/\/+$/, '');

// `login <key>` works for the cloud; any other instance needs its URL first
const loginCommand = (base: string) =>
  base === CLOUD_URL ? 'npx -y pocket3d login <api-key>' : `npx -y pocket3d login ${base} <api-key>`;

function body(base: string) {
  return `## Set up (once per machine)

1. Check: \`npx -y pocket3d whoami\`. If it prints an account, skip to Publish.
2. Otherwise ask the user for an API key. They create one at ${base}/dashboard/keys (sign up at ${base}/auth/register if they have no account).
3. Run \`${loginCommand(base)}\`. It checks the key and saves it to ~/.config/pocket3d/config.json. In CI, set POCKET3D_URL=${base} and POCKET3D_API_KEY instead.

Never write the API key into the project's files or commit it.

## Publish

\`\`\`sh
npx -y pocket3d publish model.glb --title "Short title" --cover cover.png --json
\`\`\`

- Prints one JSON object: \`{ "id", "url", "title", "fileSize" }\`. Without \`--json\` it prints only the share link.
- Give the user the \`url\`: anyone with it can open the model in an interactive viewer (phone or computer), and chat apps show a preview card.
- \`--cover\` is optional: a PNG, JPEG or WebP up to 5 MB (a render of the model, ideally 1200×630) used for link previews.
- Errors go to stderr with a non-zero exit code; read the message, it says what to fix.

## Update a model

When you change a model the user already has a link for (a fix, the next iteration of the same object), publish to that model instead of creating a new one:

\`\`\`sh
npx -y pocket3d publish model.glb --to <id-or-link> --note "what changed" --json
\`\`\`

- The link stays the same and shows the new version at once. Earlier versions stay in its history (people with the link can click through them), and \`<link>?v=2\` keeps showing v2. The JSON adds \`version\` and \`versionUrl\`.
- \`--title\` is for new models only (rename with \`pocket3d rename\`). Publish a new model only for a different object.
- To let the user check a change before people with the link see it, add \`--draft\`: the version stays private and the command prints its preview link (in the user's dashboard). Publish it when they approve: \`npx -y pocket3d publish-draft <id-or-link> <version>\` (add \`--live\` to also make the link show it).
- \`npx -y pocket3d versions <id-or-link> --json\` lists the versions; \`npx -y pocket3d live <id-or-link> <version>\` chooses which published one the link shows (to roll back). A version is \`3\` or \`v3\`.

## Requirements

- Binary glTF 2.0 (\`.glb\`), up to 95 MB. Draco and Meshopt compression are supported.
- Other formats: convert first, e.g. \`npx -y @gltf-transform/cli copy model.gltf model.glb\`, or export a .glb from Blender (\`bpy.ops.export_scene.gltf(filepath="model.glb", export_format="GLB")\`).
- The viewer shows the model as authored (no tone mapping): baked or unlit colours look exactly as exported.

## Manage models

\`\`\`sh
npx -y pocket3d list --json                 # recently changed first, with links
npx -y pocket3d rename <id-or-link> "New title"
npx -y pocket3d delete <id-or-link>         # the model and all its versions; the link stops working
npx -y pocket3d delete <id-or-link> --version 2   # one version (not the live one)
\`\`\`

Deleting can't be undone: ask the user first.

## Without Node.js

\`\`\`sh
curl -sS -H "Authorization: $POCKET3D_API_KEY" -F "file=@model.glb" -F "title=Short title" -F "cover=@cover.png" ${base}/api/public/v1/assets
\`\`\`

The JSON answer has the share link in \`url\`. A new version of an existing model: the same with \`-F "note=what changed"\` (and \`-F "draft=true"\` for a draft) to ${base}/api/public/v1/assets/<id>/versions. API reference: ${base}/api/docs

## MCP

If the pocket3d MCP server is connected (${base}/mcp), its tools do the same: \`create_upload_link\` for local files (run the curl command it returns; if your network can't reach ${base}, give the user its \`upload_page\` link to upload from their browser), \`publish_from_url\` for a .glb already on the web, plus \`list_models\`, \`rename_model\`, \`delete_model\` and \`whoami\`. Both publish tools take \`model\` (and \`note\`, \`draft\`) to add a version to an existing model; \`list_versions\`, \`publish_draft\`, \`set_live_version\` and \`delete_version\` manage them.
`;
}

export function skillMarkdown(mainUrl?: string) {
  const base = clean(mainUrl || CLOUD_URL);
  return `---
name: pocket3d
description: Publish a 3D model (.glb) to pocket3d and get a share link anyone can open in an interactive 3D viewer, with a link preview. Use when the user asks to publish, share, host or preview a 3D model or a .glb file, or wants a link to a model you made.
---

# pocket3d

pocket3d (${base}) turns a .glb file into a link that opens an interactive viewer on any device. Use the \`pocket3d\` CLI through npx; it needs Node.js 20 or later.

${body(base)}`;
}

// https://llmstxt.org: what an agent reads when told "use pocket3d"
export function llmsTxt(mainUrl?: string) {
  const base = clean(mainUrl || CLOUD_URL);
  return `# pocket3d

> Publish a 3D model (.glb) from the terminal or an AI agent and get a link anyone can open: an interactive three.js viewer with link-preview tags. Works from the CLI (\`npx pocket3d publish model.glb\`), the HTTP API, or the MCP server at ${base}/mcp.

- [Agent skill (SKILL.md)](${base}/skill.md): install with \`npx -y pocket3d skill\`
- [API reference](${base}/api/docs)
- [MCP server](${base}/mcp): OAuth, or an API key as "Authorization: Bearer <key>"
- [Create an API key](${base}/dashboard/keys)

${body(base)}`;
}
