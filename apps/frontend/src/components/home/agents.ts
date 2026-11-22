// The AI agents pocket3d works with: any agent that can run a shell command
// (the CLI) or add a remote MCP server (OAuth or an API key) can publish and
// manage models. `icon` is a file in public/agents (monochrome brand marks
// from the MIT-licensed lobe-icons set); no icon: a letter tile instead
export type Agent = { name: string; icon?: string };

export const AGENTS: Agent[] = [
  { name: 'ChatGPT', icon: 'openai' },
  { name: 'OpenAI dots', icon: 'openai' },
  { name: 'Claude', icon: 'claude' },
  { name: 'Claude Duet', icon: 'claude' },
  { name: 'Claude Cowork', icon: 'claude' },
  { name: 'Claude Code', icon: 'claudecode' },
  { name: 'Codex', icon: 'codex' },
  { name: 'Cursor', icon: 'cursor' },
  { name: 'Gemini', icon: 'gemini' },
  { name: 'OpenClaw', icon: 'openclaw' },
  { name: 'Hermes Agent', icon: 'hermesagent' },
  { name: 'Grok Bot', icon: 'grokbot' },
  { name: 'Grok Build', icon: 'grok' },
  { name: 'DeepSeek', icon: 'deepseek' },
  { name: 'Kimi K3', icon: 'kimi' },
  { name: 'Muse', icon: 'muse' },
  { name: 'Manus', icon: 'manus' },
  { name: 'Cue' },
  { name: 'Perplexity Computer', icon: 'perplexity' },
  { name: 'NanoClaw' },
  { name: 'Paperclip' },
];

// The two ways in, listed after the agents
export const AGENT_DOORS: { name: string; icon: string; href: string }[] = [
  { name: 'MCP server', icon: 'mcp', href: '/dashboard/keys' },
  { name: 'pocket3d CLI', icon: 'cli', href: '/llms.txt' },
];
