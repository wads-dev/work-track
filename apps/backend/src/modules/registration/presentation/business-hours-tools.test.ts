import { expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerWorkTools } from './work-tools.js';
import type { WorkRepository } from '@work-track/core/registration/domain/work-model';
import type { ProjectManagementRepository } from '@work-track/core/registration/domain/project-management';
it('exposes contract and holiday tools, passes actor identity and validates histories before writes', async () => {
  const getBusinessHours = vi
    .fn<NonNullable<WorkRepository['getBusinessHours']>>()
    .mockResolvedValue({
      projectId: 'p',
      businessHours: [],
      expectedBusinessHours: null,
    });
  const getHolidays = vi
    .fn<NonNullable<WorkRepository['getHolidays']>>()
    .mockResolvedValue({ holidays: [], expectedHolidays: null });
  const updateHolidays = vi
    .fn<NonNullable<WorkRepository['updateHolidays']>>()
    .mockResolvedValue({ ok: true });
  const updateProject = vi
    .fn<ProjectManagementRepository['updateProject']>()
    .mockResolvedValue({
      projectId: 'p',
      updatedAt: '2026-11-11T12:00:00Z',
      project: {
        id: 'p',
        type: 'work',
        title: 'Demo',
        description: 'Projeto sintético de teste',
        createdBy: 'alice',
        createdAt: '2026-01-01T00:00:00Z',
        confidential: false,
        archived: false,
        topics: [],
      },
    });
  const repository = {
    listProjects: vi.fn(),
    createProject: vi.fn(),
    createTopic: vi.fn(),
    register: vi.fn(),
    getBusinessHours,
    getHolidays,
    updateHolidays,
  } as WorkRepository;
  const management = {
    updateProject,
    archiveProject: vi.fn(),
    mergeProjects: vi.fn(),
  } as ProjectManagementRepository;
  const server = new McpServer({ name: 'test', version: '1' }),
    client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  registerWorkTools(server, repository, 'alice', undefined, management);
  await server.connect(a);
  await client.connect(b);
  try {
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const name of [
      'get_business_hours',
      'update_business_hours',
      'get_holidays',
      'update_holidays',
    ])
      expect(names).toContain(name);
    await client.callTool({
      name: 'get_business_hours',
      arguments: { projectId: 'p' },
    });
    expect(getBusinessHours).toHaveBeenCalledWith('p', 'alice');
    const input = {
      projectId: 'p',
      businessHours: [
        { startDate: '2026-11-01', endDate: null, hoursPerDay: 8 },
      ],
      expectedBusinessHours: null,
      requestId: 'r',
      reason: 'Contrato',
    };
    expect(
      (
        await client.callTool({
          name: 'update_business_hours',
          arguments: input,
        })
      ).isError,
    ).not.toBe(true);
    expect(updateProject).toHaveBeenCalledWith(input, 'alice');
    updateProject.mockClear();
    expect(
      (
        await client.callTool({
          name: 'update_business_hours',
          arguments: {
            ...input,
            businessHours: [...input.businessHours, ...input.businessHours],
          },
        })
      ).isError,
    ).toBe(true);
    expect(updateProject).not.toHaveBeenCalled();
    await client.callTool({ name: 'get_holidays', arguments: {} });
    expect(getHolidays).toHaveBeenCalledOnce();
    const holidays = {
      holidays: [
        {
          date: '2026-12-25',
          type: 'every_year_same_date' as const,
          name: 'Natal',
        },
        { date: '2026-11-02', name: 'Finados' },
      ],
      expectedHolidays: null,
      requestId: 'h',
      reason: 'Calendário',
    };
    await client.callTool({ name: 'update_holidays', arguments: holidays });
    expect(updateHolidays).toHaveBeenCalledWith(holidays, 'alice');
    updateHolidays.mockClear();
    expect(
      (
        await client.callTool({
          name: 'update_holidays',
          arguments: {
            ...holidays,
            holidays: [{ date: '02-30', name: 'Inválido' }],
          },
        })
      ).isError,
    ).toBe(true);
    expect(updateHolidays).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
  }
});
