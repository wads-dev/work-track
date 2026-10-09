import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

const client = new Client({ name: 'work-track-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: 'npx',
  args: [
    '-y',
    'mcp-remote',
    'https://wadsworktrack.web.app/mcp',
    '--auth-timeout',
    '600',
  ],
  env: { ...process.env, MCP_REMOTE_CONFIG_DIR: resolve('.mcp-auth') },
  stderr: 'inherit',
});
try {
  await client.connect(transport, { timeout: 660000 });
  const tools = await client.listTools();
  console.log('MCP_TOOLS', JSON.stringify(tools));
  const identity = await client.callTool({ name: 'whoami', arguments: {} });
  console.log('MCP_IDENTITY', JSON.stringify(identity));
} finally {
  await client.close();
  await transport.close();
}
