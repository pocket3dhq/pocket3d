// MAIN_URL without a trailing slash: where people open pocket3d, and the
// base of every link, the OAuth issuer and the MCP URL
export const mainUrl = () => (process.env.MAIN_URL || '').replace(/\/+$/, '');

// The MCP endpoint (nginx sends /mcp straight to the backend)
export const mcpUrl = () => `${mainUrl()}/mcp`;
