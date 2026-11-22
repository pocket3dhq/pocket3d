import { CLOUD_URL } from '@pocket3d/helpers/agent/skill';

// What the Connect page tells each client to do. Coding agents get the
// CLI + skill (local files) and the MCP server; chat apps get the MCP
// connector URL
export const AGENT_CLIENTS = ['Claude Code', 'Cursor', 'Codex', 'Claude.ai / Desktop', 'Other agents'] as const;
export type AgentClient = (typeof AGENT_CLIENTS)[number];

export interface SetupStep {
  title: string;
  hint: string;
  code: string;
}

export const KEY_PLACEHOLDER = '<your-api-key>';

const clean = (url: string) => url.replace(/\/+$/, '');

// `login <key>` is enough for the cloud; other instances need their URL
export const cliLogin = (mainUrl: string, apiKey?: string) => {
  const base = clean(mainUrl);
  const key = apiKey || KEY_PLACEHOLDER;
  return base === CLOUD_URL ? `npx -y pocket3d login ${key}` : `npx -y pocket3d login ${base} ${key}`;
};

export function agentSetup(client: AgentClient, mainUrl: string, apiKey?: string): SetupStep[] {
  const base = clean(mainUrl);
  const mcp = `${base}/mcp`;
  const login = cliLogin(base, apiKey);
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return base;
    }
  })();

  switch (client) {
    case 'Claude Code':
      return [
        {
          title: 'Publish from the terminal (recommended)',
          hint: 'Run once. It saves your key and installs the pocket3d skill, which teaches Claude Code to publish models and hand you the link.',
          code: `${login} && npx -y pocket3d skill`,
        },
        {
          title: 'Or connect the MCP server',
          hint: 'Then run /mcp in Claude Code, pick pocket3d and sign in. No API key needed.',
          code: `claude mcp add --transport http pocket3d ${mcp}`,
        },
      ];
    case 'Cursor':
      return [
        {
          title: 'Connect the MCP server',
          hint: 'Add to ~/.cursor/mcp.json (or .cursor/mcp.json in a project). Cursor opens pocket3d to sign in.',
          code: JSON.stringify({ mcpServers: { pocket3d: { url: mcp } } }, null, 2),
        },
        {
          title: 'And the CLI, for files on your machine',
          hint: 'Run once in a terminal. The agent can then run npx pocket3d publish model.glb.',
          code: login,
        },
      ];
    case 'Codex':
      return [
        {
          title: 'Connect the MCP server',
          hint: 'Add to ~/.codex/config.toml, then run: codex mcp login pocket3d',
          code: `[mcp_servers.pocket3d]\nurl = "${mcp}"`,
        },
        {
          title: 'And the CLI, for files on your machine',
          hint: 'Run once. npx -y pocket3d skill --print prints instructions you can add to AGENTS.md.',
          code: login,
        },
      ];
    case 'Claude.ai / Desktop':
      return [
        {
          title: 'Add a custom connector',
          hint: 'Settings → Connectors → Add custom connector, paste this URL, then Connect and sign in.',
          code: mcp,
        },
        {
          title: 'To publish files from the chat',
          hint: 'Claude uploads through its code sandbox: add this domain to the sandbox’s allowed domains (Settings → Capabilities).',
          code: host,
        },
      ];
    case 'Other agents':
      return [
        {
          title: 'Paste this into the chat',
          hint: 'The agent reads the instructions, asks you for an API key, and sets itself up.',
          code: `Publish 3D models with pocket3d (${base}). Read ${base}/llms.txt and follow it: ask me for my pocket3d API key, run the login command, then publish .glb files with npx -y pocket3d publish and give me the link.`,
        },
        {
          title: 'MCP clients',
          hint: 'Streamable HTTP. Sign in with OAuth, or send an API key as the header Authorization: Bearer <key>.',
          code: mcp,
        },
      ];
  }
}
