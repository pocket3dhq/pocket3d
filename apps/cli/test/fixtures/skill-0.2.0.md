---
name: pocket3d
description: Publish a 3D model (.glb) to pocket3d and get a share link anyone can open in an interactive 3D viewer, with a link preview. Use when the user asks to publish, share, host or preview a 3D model or a .glb file, or wants a link to a model you made.
---

# pocket3d

pocket3d (https://pocket3d.co) turns a .glb file into a link that opens an interactive viewer on any device. Use the `pocket3d` CLI through npx; it needs Node.js 20 or later.

## Set up (once per machine)

1. Check: `npx -y pocket3d whoami`. If it prints an account, skip to Publish.
2. Otherwise ask the user for an API key. They create one at https://pocket3d.co/dashboard/keys (sign up at https://pocket3d.co/auth/register if they have no account).
3. Run `npx -y pocket3d login <api-key>`. It checks the key and saves it to ~/.config/pocket3d/config.json. In CI, set POCKET3D_URL=https://pocket3d.co and POCKET3D_API_KEY instead.

Never write the API key into the project's files or commit it.

## Publish

```sh
npx -y pocket3d publish model.glb --title "Short title" --cover cover.png --json
```

- Prints one JSON object: `{ "id", "url", "title", "fileSize" }`. Without `--json` it prints only the share link.
- Give the user the `url`: anyone with it can open the model in an interactive viewer (phone or computer), and chat apps show a preview card.
- `--cover` is optional: a PNG, JPEG or WebP up to 5 MB (a render of the model, ideally 1200×630) used for link previews.
- Errors go to stderr with a non-zero exit code; read the message, it says what to fix.

## Requirements

- Binary glTF 2.0 (`.glb`), up to 95 MB. Draco and Meshopt compression are supported.
- Other formats: convert first, e.g. `npx -y @gltf-transform/cli copy model.gltf model.glb`, or export a .glb from Blender (`bpy.ops.export_scene.gltf(filepath="model.glb", export_format="GLB")`).
- The viewer shows the model as authored (no tone mapping): baked or unlit colours look exactly as exported.

## Manage models

```sh
npx -y pocket3d list --json                 # newest first, with links
npx -y pocket3d rename <id-or-link> "New title"
npx -y pocket3d delete <id-or-link>         # the link stops working; ask the user first
```

Every publish creates a new link. To replace a model, publish the new file, give the user the new link, and delete the old one only if they agree.

## Without Node.js

```sh
curl -sS -H "Authorization: $POCKET3D_API_KEY" -F "file=@model.glb" -F "title=Short title" -F "cover=@cover.png" https://pocket3d.co/api/public/v1/assets
```

The JSON answer has the share link in `url`. API reference: https://pocket3d.co/api/docs

## MCP

If the pocket3d MCP server is connected (https://pocket3d.co/mcp), its tools do the same: `create_upload_link` (then run the curl command it returns) for local files, `publish_from_url` for a .glb already on the web, plus `list_models`, `rename_model`, `delete_model` and `whoami`.
