import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '../../components/ui/tooltip';
import { RecordEditorForm } from './RecordEditorForm';
import { RecordDetails } from './RecordDetails';
import { RecordAuditEvent } from './RecordAuditEvent';
import { readFileSync } from 'node:fs';
import { prepareEditorOptions } from '../../data/repositories/editor-options-repository';
const noop = () => {};
const initialProps = {
  catalog: [
    {
      id: 'p',
      data: {
        type: 'work',
        createdBy: 'me',
        archived: false,
        confidential: false,
        title: 'Projeto',
        topics: [{ id: 't', title: 'Entrega', archived: false }],
      },
    },
    {
      id: 'hidden',
      data: {
        type: 'work',
        createdBy: 'me',
        archived: false,
        title: 'Segredo',
        confidential: true,
        topics: [],
      },
    },
  ],
  revealed: false,
  projectId: 'p',
  topics: [{ topicId: 't', percentage: 100 }],
  start: '2026-10-08T11:00',
  end: '2026-10-08T12:15',
  description: 'Contexto',
  busy: false,
  focusEnd: false,
  sharing: false,
  ack: false,
  onProject: noop,
  onTopics: noop,
  onStart: noop,
  onEnd: noop,
  onDescription: noop,
  onAck: noop,
  onSave: noop,
};
const props = {
  ...initialProps,
  options: prepareEditorOptions(
    initialProps.catalog,
    {
      projectId: initialProps.projectId,
      revealed: initialProps.revealed,
      selectedTopics: initialProps.topics,
    },
    initialProps.catalog[0].data,
  ),
};
describe('compact shared record editor', () => {
  it('renders repository-retained archived and merged selections with untouched allocations', () => {
    const selection = [
      { topicId: 'old', percentage: 75 },
      { topicId: 'alias', durationMinutes: 15 },
    ];
    const options = prepareEditorOptions(
      [
        {
          id: 'p',
          data: {
            type: 'work',
            createdBy: 'me',
            confidential: false,
            title: 'Project',
            archived: true,
            topics: [
              { id: 'active', title: 'Active', archived: false },
              { id: 'old', title: 'Retired selected', archived: true },
              {
                id: 'alias',
                title: 'Merged selected',
                archived: false,
                mergedIntoTopicId: 'active',
              },
              { id: 'retired', title: 'Retired unused', archived: true },
            ],
          },
        },
      ],
      { projectId: 'p', revealed: true, selectedTopics: selection },
      {
        type: 'work',
        createdBy: 'me',
        confidential: false,
        title: 'Project',
        archived: true,
        topics: [
          { id: 'active', title: 'Active', archived: false },
          { id: 'old', title: 'Retired selected', archived: true },
          {
            id: 'alias',
            title: 'Merged selected',
            archived: false,
            mergedIntoTopicId: 'active',
          },
          { id: 'retired', title: 'Retired unused', archived: true },
        ],
      },
    );
    const html = renderToStaticMarkup(
      <RecordEditorForm
        {...props}
        options={options}
        topics={selection}
        revealed
      />,
    );
    expect(html).toContain('Retired selected');
    expect(html).toContain('Merged selected');
    expect(html).toContain('75%');
    expect(html).toContain('15 min');
    expect(html).not.toContain('Retired unused');
  });
  it('does not derive live options from catalog snapshots and delegates all selection to repository', () => {
    const html = renderToStaticMarkup(<RecordEditorForm {...initialProps} />);
    expect(html).not.toContain('Entrega');
    const source = readFileSync(
      new URL('./RecordEditorForm.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('EditorOptionsRepository');
    expect(source).toMatch(/repository\s*\.read\(selection\)/);
    expect(source).not.toMatch(/\.(filter|find|slice)\(/);
    const caller = readFileSync(
      new URL('./RecordDrawer.tsx', import.meta.url),
      'utf8',
    );
    expect(caller).toMatch(/<RecordEditorForm[\s\S]*?db={db}[\s\S]*?uid={uid}/);
  });
  it('groups period fields together and removes redundant confirmations and manual reason', () => {
    const html = renderToStaticMarkup(<RecordEditorForm {...props} />);
    expect(html).toContain('data-record-period');
    expect(html).toContain('Início');
    expect(html).toContain('Fim');
    expect(html).toContain('Deixar em aberto');
    expect(html).toContain('100%');
    expect(html).not.toContain('Motivo');
    expect(html).not.toContain('Confirmo o horário');
    expect(html).not.toContain('Segredo');
  });
  it('shows only destination topics and publication acknowledgement only when needed', () => {
    const html = renderToStaticMarkup(
      <RecordEditorForm
        {...props}
        projectId="q"
        topics={[]}
        catalog={[
          {
            id: 'q',
            data: {
              type: 'work',
              createdBy: 'me',
              archived: false,
              confidential: false,
              title: 'Outro',
              topics: [{ id: 'q-topic', title: 'Destino', archived: false }],
            },
          },
        ]}
        options={prepareEditorOptions(
          [
            {
              id: 'q',
              data: {
                type: 'work',
                createdBy: 'me',
                archived: false,
                confidential: false,
                title: 'Outro',
                topics: [{ id: 'q-topic', title: 'Destino', archived: false }],
              },
            },
          ],
          { projectId: 'q', revealed: false, selectedTopics: [] },
          {
            type: 'work',
            createdBy: 'me',
            archived: false,
            confidential: false,
            title: 'Outro',
            topics: [{ id: 'q-topic', title: 'Destino', archived: false }],
          },
        )}
        sharing
      />,
    );
    expect(html).toContain('Destino');
    expect(html).not.toContain('Entrega');
    expect(html).toContain('Autorizo compartilhar');
    expect(html).toContain('texto original completo');
  });
  it('places ID and creation timestamp in secondary details after content with copying', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <MemoryRouter>
          <RecordDetails
            record={{
              projectId: 'p',
              startedAt: '2026-10-08T14:00Z',
              endedAt: null,
              originalText: 'Original',
              interpretation: 'Contexto',
            }}
            recordId="r"
            project={props.catalog[0]!.data}
            revealed
          />
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(html).toContain('grid-cols-2');
    expect(html.indexOf('ID ·')).toBeGreaterThan(
      html.indexOf('Descrição / contexto'),
    );
    expect(html).toContain('Copiar ID do registro');
    expect(html).toContain('Em aberto');
  });
  it('renders changes to all editable fields with actor and before after, not just end', () => {
    const html = renderToStaticMarkup(
      <RecordAuditEvent
        event={{
          authorUid: 'alice',
          updatedAt: '2026-10-08T15:00:00Z',
          before: { interpretation: 'Antes' },
          after: { interpretation: 'Depois', endedAt: '2026-10-08T15:00:00Z' },
        }}
      />,
    );
    expect(html).toContain('alice');
    expect(html).toContain('Antes');
    expect(html).toContain('Depois');
    expect(html).toContain('Descrição / contexto');
    expect(html).toContain('Em aberto');
  });
  it('keeps direct audited saves stable and protects editor baseline and untouched seconds', () => {
    const source = readFileSync(
      new URL('./RecordDrawer.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('editorVersion.current');
    expect(source).toContain('expectedUpdatedAt: editorVersion.current');
    expect(source).toContain('String(record.startedAt)');
    expect(source).toContain('String(record.endedAt)');
    expect(source).not.toContain('setConfirmed');
    expect(source).not.toContain('<MoveDialog');
    expect(source).toContain('Edição de registro pela interface web.');
    expect(source).toContain('setEditedTopics([])');
  });
});
