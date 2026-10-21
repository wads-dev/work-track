import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';

// Execute view hook/effect lifetimes without browser services or a DOM dependency.
const hooks = vi.hoisted(() => {
  const values: unknown[] = [],
    effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  let cursor = 0,
    changed = false;
  let pending: (() => void)[] = [];
  return {
    reset() {
      values.length = 0;
      effects.forEach((effect) => effect?.cleanup?.());
      effects.length = 0;
      pending = [];
    },
    render(view: () => unknown) {
      cursor = 0;
      changed = false;
      return view();
    },
    commit() {
      const jobs = pending;
      pending = [];
      jobs.forEach((job) => job());
    },
    get changed() {
      return changed;
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values))
        values[index] = typeof initial === 'function' ? initial() : initial;
      return [
        values[index],
        (update: unknown) => {
          const value =
            typeof update === 'function' ? update(values[index]) : update;
          if (!Object.is(values[index], value)) {
            values[index] = value;
            changed = true;
          }
        },
      ];
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = cursor++,
        previous = effects[index];
      if (
        previous &&
        deps.length === previous.deps.length &&
        deps.every((value, i) => Object.is(value, previous.deps[i]))
      )
        return;
      effects[index] = { deps };
      pending.push(() => {
        previous?.cleanup?.();
        const cleanup = effect();
        if (cleanup) effects[index].cleanup = cleanup;
      });
    },
  };
});
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: hooks.useState,
  useEffect: hooks.useEffect,
}));
const m = vi.hoisted(() => ({
  db: {},
  functions: { app: {} },
  params: new URLSearchParams(),
  projects: {
    rows: [
      {
        id: 'p',
        data: {
          title: 'Demo',
          type: 'work',
          createdBy: 'alice',
          confidential: false,
          archived: false,
          topics: [],
        },
      },
    ],
    complete: true,
    loading: false,
    error: '',
    retry: () => {},
  },
  subscriptions: [] as {
    next: (snapshot: unknown) => void;
    stop: ReturnType<typeof vi.fn>;
  }[],
  failSource: false,
  deferSource: false,
  access: 0,
  calculate: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({ getFirestore: () => m.db }));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [
    m.params,
    (next: URLSearchParams) => {
      m.params = next;
    },
  ],
  useLocation: () => ({ pathname: '/me', search: '' }),
  useParams: () => ({ projectId: 'p', topicId: 't' }),
  Link: 'a',
}));
vi.mock('../projects/hooks/useProjects', () => ({
  useProjects: () => m.projects,
}));
vi.mock('../people/CompanyPeopleContext', () => ({
  useCompanyPeople: () => ({ people: [], name: () => undefined }),
}));
vi.mock('../../shared/ui/privacy', async (original) => ({
  ...(await original<typeof import('../../shared/ui/privacy')>()),
  usePrivacy: () => ({ revealed: true }),
}));
vi.mock('../../data/cache/project-access-revision', () => ({
  useProjectAccessRevision: () => m.access,
  projectAccessRevision: () => m.access,
}));
vi.mock('../../data/cache/record-deletion', () => ({
  useDeletionRevision: () => 0,
  deletionRevision: () => 0,
}));
vi.mock('../../data/sources/authorized-report-source', () => ({
  subscribeAuthorizedReport: (
    _db: unknown,
    _uid: string,
    next: (snapshot: unknown) => void,
    fail: (error: Error) => void,
  ) => {
    const stop = vi.fn();
    m.subscriptions.push({ next, stop });
    if (m.failSource) fail(new Error('local-source-error'));
    else if (!m.deferSource) next(repository());
    return stop;
  },
}));
function repository() {
  return {
    repository: {
      db: m.db,
      viewer: 'alice',
      projects: new Map([['p', m.projects.rows[0].data]]),
      calendar: () => ({ own: {} }),
      project: () => ({}),
    },
    coherent: true,
    fromCache: false,
    hasPendingWrites: false,
  };
}
vi.mock('../../data/repositories/browser-detail-repository', () => ({
  BrowserDetailRepository: class {
    readReportCatalog() {
      return m.catalog();
    }
    readProjectTopic() {
      return m.catalog();
    }
    readDescriptions() {
      return Promise.resolve(new Map());
    }
  },
  descriptionKey: () => '',
}));
vi.mock('@work-track/core/reports/application/get-personal-report', () => ({
  executePersonalReport: (...args: unknown[]) => m.calculate(...args),
}));
vi.mock('@work-track/core/reports/application/get-calendar-report', () => ({
  executeCalendarReport: (...args: unknown[]) => m.calculate(...args),
}));
vi.mock('@work-track/core/reports/application/get-project-report', () => ({
  getProjectReport: (...args: unknown[]) => m.calculate(...args),
}));
vi.mock('@work-track/core/reports/application/get-topic-report', () => ({
  getTopicReport: (...args: unknown[]) => m.calculate(...args),
}));
vi.mock('../../data/sources/local-topic-report', () => ({
  LocalTopicReportRepository: class {},
}));
vi.mock('./topic-details', async (original) => ({
  ...(await original<typeof import('./topic-details')>()),
  validateTopicReport: (value: unknown) => value,
}));
import { PersonalPage } from './PersonalPage';
import { ProjectReport } from './ProjectReport';
import { TopicDetails } from './TopicDetails';
import { ReportToolbar } from './ReportToolbar';
import { CalendarToolbar } from './CalendarToolbar';
import { CalendarTimeline } from './CalendarTimeline';
import { RecordDrawer } from '../records/RecordDrawer';
import { PORTRAIT_MOBILE_QUERY } from './calendar-view';
afterEach(() => {
  hooks.reset();
  vi.unstubAllGlobals();
});

function elements(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...elements(value.props.children)];
}
async function settle(view: () => unknown) {
  let tree: unknown;
  for (let i = 0; i < 40; i++) {
    tree = hooks.render(view);
    hooks.commit();
    for (let j = 0; j < 8; j++) await Promise.resolve();
    if (!hooks.changed) return tree;
  }
  throw new Error('View did not settle');
}
const report = {
  totalMinutes: 60,
  byProject: [],
  byTopic: [],
  byUser: [],
  intervals: [],
  records: [],
  warnings: [],
  page: { partial: false },
  participants: [],
  occurrenceCount: 1,
};
beforeEach(() => {
  hooks.reset();
  vi.clearAllMocks();
  m.subscriptions.length = 0;
  m.params = new URLSearchParams();
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    matchMedia: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  m.projects.complete = true;
  m.projects.loading = false;
  m.projects.error = '';
  m.failSource = false;
  m.deferSource = false;
  m.access = 0;
  m.catalog.mockResolvedValue({
    projects: new Map([['p', m.projects.rows[0].data]]),
    projectOptions: [],
    topics: [],
    selectionAvailable: true,
    project: m.projects.rows[0].data,
    canonical: 't',
    topic: { title: 'Demo topic' },
  });
  m.calculate.mockResolvedValue(report);
});
it.each([false, true])(
  'defaults calendar view for portrait mobile=%s and preserves explicit links',
  async (portrait) => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
      matchMedia: vi.fn((query: string) => ({
        matches: query === PORTRAIT_MOBILE_QUERY && portrait,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    let tree = await settle(() => PersonalPage({ ...props, calendar: true }));
    const toolbar = () =>
      elements(tree).find((element) => element.type === CalendarToolbar)!;
    expect(toolbar().props.view).toBe(portrait ? 'day' : 'three-days');
    m.params = new URLSearchParams('view=week&date=2026-10-10');
    tree = await settle(() => PersonalPage({ ...props, calendar: true }));
    expect(toolbar().props.view).toBe('week');
    expect(toolbar().props.date).toBe('2026-10-10');
  },
);

it('preserves the selected record when initializing the own-person calendar URL', async () => {
  m.params = new URLSearchParams('view=day&date=2026-10-10&record=r');
  const tree = await settle(() => PersonalPage({ ...props, calendar: true }));
  expect(m.params.get('uid')).toBe('alice');
  expect(m.params.get('record')).toBe('r');
  const drawer = elements(tree).find(
    (element) => element.type === RecordDrawer,
  )!;
  expect(drawer.props.recordId).toBe('r');
  const toolbar = elements(tree).find(
    (element) => element.type === CalendarToolbar,
  )!;
  expect(toolbar.props.view).toBe('day');
  expect(toolbar.props.date).toBe('2026-10-10');
  (drawer.props.onClose as () => void)();
  expect(m.params.get('record')).toBeNull();
  expect(m.params.get('date')).toBe('2026-10-10');
});

const props = {
  db: m.db as never,
  functions: m.functions as never,
  uid: 'alice',
};
it('personal report loads, survives listener refresh while a calculation is pending and then updates', async () => {
  const view = () => PersonalPage(props);
  let tree = await settle(view);
  const toolbar = () =>
    elements(tree).find((element) => element.type === ReportToolbar)!;
  expect(toolbar().props.total).toBe('1 h');
  expect(toolbar().props.loading).toBe(false);
  let resolve!: (value: typeof report) => void;
  m.calculate.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  m.projects.loading = true;
  m.subscriptions.at(-1)!.next(repository());
  tree = await settle(view);
  expect(toolbar().props.total).toBe('1 h');
  expect(toolbar().props.loading).toBe(true);
  expect(m.subscriptions[0].stop).not.toHaveBeenCalled();
  m.projects.loading = false;
  resolve({ ...report, totalMinutes: 120 });
  tree = await settle(view);
  expect(toolbar().props.total).toBe('2 h');
  expect(toolbar().props.loading).toBe(false);
  (toolbar().props.onRefresh as () => void)();
  tree = await settle(view);
  expect(toolbar().props.total).toBe('1 h');
});
it.each(['catalog', 'source'])(
  'click retries a failed local %s without a new listener notification',
  async (failure) => {
    const view = () => PersonalPage(props);
    if (failure === 'catalog')
      m.catalog.mockRejectedValueOnce(new Error('local-catalog-error'));
    else m.failSource = true;
    let tree = await settle(view);
    const toolbar = () =>
      elements(tree).find((element) => element.type === ReportToolbar)!;
    expect(toolbar().props.total).toBe('—');
    expect(toolbar().props.loading).toBe(false);
    m.failSource = false;
    (toolbar().props.onRefresh as () => void)();
    tree = await settle(view);
    expect(toolbar().props.total).toBe('1 h');
    expect(toolbar().props.loading).toBe(false);
  },
);
it('initial project loading settles even when catalog readiness arrives before its local result', async () => {
  const view = () => PersonalPage(props);
  m.projects.complete = false;
  m.projects.loading = true;
  await settle(view);
  expect(m.calculate).not.toHaveBeenCalled();
  m.projects.complete = true;
  let tree = await settle(view);
  let toolbar = elements(tree).find(
    (element) => element.type === ReportToolbar,
  )!;
  expect(toolbar.props.total).toBe('1 h');
  expect(toolbar.props.loading).toBe(true);
  m.projects.loading = false;
  tree = await settle(view);
  toolbar = elements(tree).find((element) => element.type === ReportToolbar)!;
  expect(toolbar.props.total).toBe('1 h');
  expect(toolbar.props.loading).toBe(false);
});
it('starts the refresh indicator while the local source query is pending, not only during calculation', async () => {
  const view = () => PersonalPage(props);
  let tree = await settle(view);
  const toolbar = () =>
    elements(tree).find((element) => element.type === ReportToolbar)!;
  m.projects.loading = true;
  tree = await settle(view);
  expect(toolbar().props.total).toBe('1 h');
  expect(toolbar().props.loading).toBe(true);
  m.projects.loading = false;
  m.deferSource = true;
  const catalog = await m.catalog();
  m.catalog.mockResolvedValue({ ...catalog });
  (toolbar().props.onRefresh as () => void)();
  tree = await settle(view);
  expect(toolbar().props.total).toBe('1 h');
  expect(toolbar().props.loading).toBe(true);
  m.subscriptions.at(-1)!.next(repository());
  tree = await settle(view);
  expect(toolbar().props.loading).toBe(false);
});
it('keeps refresh busy until a slower catalog query completes', async () => {
  const view = () => PersonalPage(props);
  let tree = await settle(view);
  const toolbar = () =>
    elements(tree).find((element) => element.type === ReportToolbar)!;
  const catalog = await m.catalog();
  let resolve!: (value: unknown) => void;
  m.catalog.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  (toolbar().props.onRefresh as () => void)();
  tree = await settle(view);
  expect(toolbar().props.total).toBe('1 h');
  expect(toolbar().props.loading).toBe(true);
  resolve({ ...catalog });
  tree = await settle(view);
  expect(toolbar().props.total).toBe('1 h');
  expect(toolbar().props.loading).toBe(false);
});
it('does not cancel a pending catalog when project loading toggles', async () => {
  let resolve!: (value: unknown) => void;
  m.catalog.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  const view = () => PersonalPage(props);
  await settle(view);
  expect(m.calculate).not.toHaveBeenCalled();
  m.projects.loading = true;
  await settle(view);
  m.projects.loading = false;
  await settle(view);
  expect(m.catalog).toHaveBeenCalledOnce();
  resolve({
    projects: new Map([['p', m.projects.rows[0].data]]),
    projectOptions: [],
    topics: [],
    selectionAvailable: true,
  });
  const tree = await settle(view);
  const toolbar = elements(tree).find(
    (element) => element.type === ReportToolbar,
  )!;
  expect(toolbar.props.total).toBe('1 h');
  expect(toolbar.props.loading).toBe(false);
});
it('an obsolete calculation cannot restore totals after an access change', async () => {
  const view = () => PersonalPage(props);
  let tree = await settle(view);
  const toolbar = () =>
    elements(tree).find((element) => element.type === ReportToolbar)!;
  expect(toolbar().props.total).toBe('1 h');
  let resolveOld!: (value: typeof report) => void,
    resolveCurrent!: (value: typeof report) => void;
  m.calculate.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolveOld = yes;
      }),
  );
  m.subscriptions.at(-1)!.next(repository());
  tree = await settle(view);
  m.calculate.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolveCurrent = yes;
      }),
  );
  m.access++;
  tree = await settle(view);
  expect(toolbar().props.total).toBe('—');
  resolveOld({ ...report, totalMinutes: 999 });
  tree = await settle(view);
  expect(toolbar().props.total).toBe('—');
  resolveCurrent({ ...report, totalMinutes: 120 });
  tree = await settle(view);
  expect(toolbar().props.total).toBe('2 h');
  expect(toolbar().props.loading).toBe(false);
});
it('calendar uses the same retained result and loading for click, focus, timer and listener', async () => {
  const win = new EventTarget();
  const doc = { visibilityState: 'visible' };
  let timer!: () => void;
  vi.stubGlobal('document', doc);
  vi.stubGlobal(
    'window',
    Object.assign(win, {
      matchMedia: window.matchMedia,
      setInterval: vi.fn((callback: () => void) => {
        timer = callback;
        return 1;
      }),
      clearInterval: vi.fn(),
    }),
  );
  m.params = new URLSearchParams('uid=alice&date=2026-10-08&view=day');
  const calendar = {
    ...report,
    policy: 'calendar-v3',
    viewerUid: 'alice',
    mode: 'own',
    scope: 'all-selected',
    page: { partial: false, nextCursor: null },
    estimatedCount: 0,
    timeZone: 'America/Sao_Paulo',
  };
  m.calculate.mockResolvedValue(calendar);
  const view = () => PersonalPage({ ...props, calendar: true });
  let tree = await settle(view);
  const toolbar = () =>
    elements(tree).find((element) => element.type === CalendarToolbar)!;
  const hasCalendar = () =>
    elements(tree).some((element) => element.type === CalendarTimeline);
  expect(hasCalendar()).toBe(true);
  expect(window.setInterval).toHaveBeenCalledWith(
    expect.any(Function),
    5 * 60 * 1000,
  );
  const triggers = [
    () => (toolbar().props.onRefresh as () => void)(),
    () => win.dispatchEvent(new Event('focus')),
    () => timer(),
    () => m.subscriptions.at(-1)!.next(repository()),
  ];
  for (const trigger of triggers) {
    let resolve!: (value: typeof calendar) => void;
    m.calculate.mockImplementationOnce(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const before = m.calculate.mock.calls.length;
    trigger();
    tree = await settle(view);
    expect(m.calculate).toHaveBeenCalledTimes(before + 1);
    expect(toolbar().props.loading).toBe(true);
    expect(hasCalendar()).toBe(true);
    resolve(calendar);
    tree = await settle(view);
    expect(toolbar().props.loading).toBe(false);
    expect(hasCalendar()).toBe(true);
  }
});
it('project report finishes initial loading and keeps its section during both listener and button recalculations', async () => {
  let refreshKey = 0;
  const view = () =>
    ProjectReport({
      ...props,
      projectId: 'p',
      search: '',
      hidden: false,
      refreshKey,
    });
  let tree = await settle(view);
  const hasReport = () =>
    elements(tree).some(
      (element) => element.props['aria-label'] === 'Relatório do projeto',
    );
  expect(hasReport()).toBe(true);
  let resolve!: (value: typeof report) => void;
  m.calculate.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  m.projects.loading = true;
  m.subscriptions.at(-1)!.next(repository());
  tree = await settle(view);
  expect(hasReport()).toBe(true);
  expect(m.subscriptions[0].stop).not.toHaveBeenCalled();
  m.projects.loading = false;
  resolve(report);
  tree = await settle(view);
  refreshKey++;
  tree = await settle(view);
  expect(hasReport()).toBe(true);
});
it('topic report retains totals during listener and button reload and spins the same button', async () => {
  const view = () => TopicDetails(props);
  let tree = await settle(view);
  const refresh = () =>
    elements(tree).find(
      (element) =>
        element.props['aria-label'] === 'Atualizar relatório do tópico',
    )!;
  const hasTotal = () =>
    elements(tree).some(
      (element) => element.props.children === 'Tempo atribuído',
    );
  expect(hasTotal()).toBe(true);
  expect(refresh().props['aria-busy']).toBe(false);
  let resolve!: (value: typeof report) => void;
  m.calculate.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  m.projects.loading = true;
  m.subscriptions.at(-1)!.next(repository());
  tree = await settle(view);
  expect(hasTotal()).toBe(true);
  expect(refresh().props['aria-busy']).toBe(true);
  m.projects.loading = false;
  resolve(report);
  tree = await settle(view);
  m.calculate.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      }),
  );
  (refresh().props.onClick as () => void)();
  tree = await settle(view);
  expect(hasTotal()).toBe(true);
  expect(refresh().props['aria-busy']).toBe(true);
  resolve(report);
  tree = await settle(view);
  expect(refresh().props['aria-busy']).toBe(false);
});
