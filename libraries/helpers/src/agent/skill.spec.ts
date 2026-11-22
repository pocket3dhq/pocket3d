import { llmsTxt, skillMarkdown } from './skill';

describe('agent skill', () => {
  it('is a valid SKILL.md for the cloud by default', () => {
    const md = skillMarkdown();
    expect(md).toMatch(/^---\nname: pocket3d\ndescription: .+\n---\n/);
    expect(md).toContain('npx -y pocket3d login <api-key>');
    expect(md).toContain('https://pocket3d.co/dashboard/keys');
    expect(md).toContain('publish model.glb');
  });

  it('points a self-hosted instance at itself', () => {
    const md = skillMarkdown('https://3d.example.com/');
    expect(md).toContain('npx -y pocket3d login https://3d.example.com <api-key>');
    expect(md).toContain('https://3d.example.com/api/public/v1/assets');
    expect(md).not.toContain('pocket3d.co');
  });

  it('llms.txt starts with the title and summary, and links the skill and MCP server', () => {
    const txt = llmsTxt('https://pocket3d.co');
    expect(txt).toMatch(/^# pocket3d\n\n> /);
    expect(txt).toContain('https://pocket3d.co/skill.md');
    expect(txt).toContain('https://pocket3d.co/mcp');
  });
});
