import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '../../components/ui/tooltip';
import { Timestamp } from 'firebase/firestore';
import { RecordDetails } from './RecordDetails';
const render = (record: Record<string, unknown>) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>
        <RecordDetails
          record={record}
          recordId="r"
          project={undefined}
          revealed={true}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
it('shows only logged duration with an accounting disclaimer without context', () => {
  const html = render({
    startedAt: '2026-10-08T13:00:00Z',
    endedAt: '2026-10-08T17:00:00Z',
  });
  expect(html).toContain('<dt>Logged</dt>');
  expect(html).toContain('4h');
  expect(html).toContain(
    'O tempo contabilizado pode ser menor quando houver atividades simultâneas.',
  );
});
it('accepts Firestore timestamps and never invents an end for an open record', () => {
  expect(
    render({
      startedAt: Timestamp.fromDate(new Date('2026-10-08T13:00:00Z')),
      endedAt: Timestamp.fromDate(new Date('2026-10-08T17:00:00Z')),
    }),
  ).toContain('4h');
  expect(render({ startedAt: '2026-10-08T13:00:00Z' })).toContain(
    'Em aberto — duração ainda não definida',
  );
  expect(render({ startedAt: 'invalid', endedAt: 'invalid' })).toContain(
    'Duração indisponível',
  );
});
