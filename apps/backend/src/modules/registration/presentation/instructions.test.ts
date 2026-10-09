import { expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerWorkTools } from './work-tools.js';
import type { WorkRepository } from '../domain/work-model.js';
import { instructionPrefix } from './instructions.js';
it('serves conceptual plain text with SDK, prefixes work descriptions, never touches repositories', async () => {
  const listProjects = vi.fn<WorkRepository['listProjects']>(),
    createProject = vi.fn<WorkRepository['createProject']>(),
    createTopic = vi.fn<WorkRepository['createTopic']>(),
    register = vi.fn<WorkRepository['register']>();
  const server = new McpServer({ name: 'test', version: '1' }),
    client = new Client({ name: 'test-client', version: '1' }),
    [a, b] = InMemoryTransport.createLinkedPair();
  registerWorkTools(
    server,
    { listProjects, createProject, createTopic, register },
    'alice',
  );
  await server.connect(a);
  await client.connect(b);
  try {
    const tools = await client.listTools();
    expect(
      tools.tools.find((t) => t.name === 'get_instructions')?.annotations,
    ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    for (const tool of tools.tools.filter((t) => t.name !== 'get_instructions'))
      expect(tool.description?.startsWith(instructionPrefix)).toBe(true);
    const response = await client.callTool({
      name: 'get_instructions',
      arguments: {},
    });
    expect(response.isError).not.toBe(true);
    const text = JSON.stringify(response.content);
    for (const concept of [
      'search_projects',
      'Geral',
      'originalText',
      'interpretation',
      'momento da fala',
      'America/Sao_Paulo',
      'closePrevious',
      'closedPreviousRecordId',
      'confirmação humana',
      'não são autorização',
      'preview',
      '8h',
      'requestId',
    ])
      expect(text).toContain(concept);
    expect(listProjects).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    expect(createTopic).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
  }
});
