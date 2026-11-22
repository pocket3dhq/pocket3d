import { AGENT_CLIENTS, agentSetup, cliLogin, KEY_PLACEHOLDER } from './agent.setup';

describe('agentSetup', () => {
  it('logs in to the cloud with the key alone, and to other instances with their URL', () => {
    expect(cliLogin('https://pocket3d.co/', 'p3d_abc')).toBe('npx -y pocket3d login p3d_abc');
    expect(cliLogin('https://3d.example.com', 'p3d_abc')).toBe('npx -y pocket3d login https://3d.example.com p3d_abc');
    expect(cliLogin('https://pocket3d.co')).toBe(`npx -y pocket3d login ${KEY_PLACEHOLDER}`);
  });

  it('gives every client at least one step, all pointing at this instance', () => {
    for (const client of AGENT_CLIENTS) {
      const steps = agentSetup(client, 'https://3d.example.com/');
      expect(steps.length).toBeGreaterThan(0);
      const text = steps.map((s) => s.code).join('\n');
      expect(text).toMatch(/3d\.example\.com/);
      expect(text).not.toMatch(/pocket3d\.co/);
    }
  });

  it('points MCP clients at MAIN_URL/mcp without putting a key in it', () => {
    const steps = agentSetup('Claude Code', 'https://pocket3d.co', 'p3d_secret');
    expect(steps[1].code).toBe('claude mcp add --transport http pocket3d https://pocket3d.co/mcp');
    expect(steps[0].code).toBe('npx -y pocket3d login p3d_secret && npx -y pocket3d skill');
    expect(JSON.parse(agentSetup('Cursor', 'https://pocket3d.co')[0].code)).toEqual({
      mcpServers: { pocket3d: { url: 'https://pocket3d.co/mcp' } },
    });
    // a key never goes into the chat paragraph
    expect(agentSetup('Other agents', 'https://pocket3d.co', 'p3d_secret')[0].code).not.toMatch(/p3d_secret/);
  });
});
