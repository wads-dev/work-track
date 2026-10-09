// Synthetic design-only seed. Default dry-run: no network and no mutation.
// Only after Lead approval: node scripts/design-demo.mjs --write --confirm-local-demo
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  projectInput,
  registerInput,
} from '../apps/backend/lib/modules/registration/domain/work-model.js';
const projectId = 'demo-work-track',
  uid = '35DvlWmc9p9KBKl6KD6i41aVGHPT',
  host = 'http://127.0.0.1:8081';
for (const [key, expected] of Object.entries({
  GCLOUD_PROJECT: projectId,
  GOOGLE_CLOUD_PROJECT: projectId,
  FIREBASE_PROJECT_ID: projectId,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
}))
  if (process.env[key] && process.env[key] !== expected)
    throw Error('Refused conflicting environment: ' + key);
const args = process.argv.slice(2);
assert(
  args.every((a) => ['--write', '--confirm-local-demo', '--json'].includes(a)),
  'Unknown argument',
);
const write = args.includes('--write');
assert(!(write && args.includes('--json')), 'JSON output cannot mutate');
assert(
  !write || args.includes('--confirm-local-demo'),
  'Explicit local demo confirmation required',
);
const prefix = 'design-demo-',
  stamp = '2026-10-08T23:50:00-03:00';
const specs = [
  [
    'plataforma',
    'Plataforma Atlas',
    'Evolução da plataforma de operações: descoberta, interface, integrações e qualidade.',
  ],
  [
    'portal',
    'Portal de clientes',
    'Experiência de autosserviço para clientes com onboarding, navegação e acompanhamento.',
  ],
  [
    'observabilidade',
    'Observabilidade e confiabilidade',
    'Monitoramento de serviços, alertas, diagnóstico de incidentes e redução de falhas.',
  ],
  [
    'pesquisa',
    'Pesquisa de produto',
    'Entrevistas sintéticas, hipóteses de uso e síntese de oportunidades de melhoria.',
  ],
  [
    'reservado',
    'Laboratório Horizonte',
    'Exploração confidencial demonstrativa de nova proposta para colaboração da equipe.',
  ],
  [
    'pessoal',
    'Estudos e experimentos',
    'Estudo pessoal demonstrativo sobre acessibilidade e prototipação de interfaces.',
  ],
  [
    'legado',
    'Migração do legado',
    'Projeto demonstrativo arquivado após concluir a migração e documentar o aprendizado.',
  ],
];
const projects = specs.map(([slug, title, description], i) => ({
  id: prefix + slug,
  ...projectInput.parse({
    title,
    description,
    category: i === 5 ? 'personal' : 'work',
    confidential: i === 4,
    publicAlias: i === 4 ? 'Projeto reservado 27' : 'Projeto reservado',
  }),
  archived: i === 6,
  createdBy: uid,
  createdAt: '2026-10-01T08:00:00-03:00',
  topics: [
    {
      id: 'general',
      title: 'Geral',
      description: 'Atividade geral do projeto.',
    },
    {
      id: prefix + 'discovery',
      title: 'Descoberta',
      description: 'Exploração de necessidades e caminhos de solução.',
    },
    {
      id: prefix + 'delivery',
      title: 'Entrega',
      description: 'Implementação, revisão e validação da solução.',
    },
  ],
}));
const records = [];
function add(project, index, start, duration, topic = 'delivery') {
  const id = prefix + 'record-' + String(index).padStart(3, '0');
  const input = registerInput.parse({
    projectId: project.id,
    startedAt: start,
    ...(duration === undefined
      ? {}
      : {
          endedAt: new Date(Date.parse(start) + duration * 60000).toISOString(),
        }),
    commandAt: start,
    timeZone: 'America/Sao_Paulo',
    requestId: id,
    originalText:
      '[DEMONSTRAÇÃO SINTÉTICA] Trabalhei em ' +
      project.title +
      '; atividade fictícia para revisão de interface.',
    interpretation:
      'Exemplo sintético de ' +
      (topic === 'discovery'
        ? 'descoberta e planejamento'
        : 'implementação e validação') +
      '. Não representa trabalho real.',
    topics: [{ topicId: prefix + topic }],
    ...(index % 9 === 0
      ? {
          interruptions: [
            {
              description: 'Pausa demonstrativa para alinhamento',
              durationMinutes: 10,
            },
          ],
        }
      : {}),
  });
  const data = {
    ...input,
    id,
    uid,
    receivedAt: stamp,
    recordedAt: stamp,
    fingerprint: createHash('sha256').update(id).digest('hex'),
    projectSnapshot: { title: project.title, description: project.description },
    topicSnapshots: [project.topics.find((t) => t.id === prefix + topic)],
  };
  records.push(data);
}
for (let day = 1; day <= 5; day++)
  for (let p = 0; p < 7; p++) {
    const hour = 8 + p;
    add(
      projects[p],
      records.length + 1,
      '2026-10-0' + day + 'T' + String(hour).padStart(2, '0') + ':00:00-03:00',
      p === 3 ? 10 : 45 + (day % 3) * 15,
      day % 2 ? 'delivery' : 'discovery',
    );
  }
add(projects[0], 36, '2026-10-08T08:00:00-03:00', undefined);
add(projects[0], 37, '2026-10-08T09:00:00-03:00', 10);
add(projects[0], 38, '2026-10-08T11:00:00-03:00', 75);
add(projects[2], 39, '2026-10-07T23:30:00-03:00', 90);
add(projects[1], 40, '2026-10-08T10:00:00-03:00', undefined);
const secondUid = 'design-demo-colleague';
for (let index = 41; index <= 44; index++) {
  add(
    projects[(index - 41) % 3],
    index,
    '2026-10-0' + (index === 44 ? '9' : '8') + 'T00:30:00-03:00',
    30 + (index - 41) * 15,
  );
  records.at(-1).uid = secondUid;
}
const docs = projects.map((p) => ['projects/' + p.id, p]);
for (const r of records) {
  const path = 'users/' + r.uid + '/records/' + r.id;
  docs.push([path, r]);
  if (Number(r.id.slice(-3)) % 8 === 0) {
    const before = {
      id: r.id,
      projectId: r.projectId,
      startedAt: r.startedAt,
      endedAt: null,
      topics: r.topics,
      interruptions: r.interruptions ?? [],
      interpretation: r.interpretation,
    };
    const after = { ...before, endedAt: r.endedAt ?? null };
    docs.push([
      path + '/audit/' + prefix + 'example',
      {
        authorUid: r.uid,
        action: 'synthetic-demo',
        reason:
          'Auditoria fictícia demonstrativa; nenhuma alteração de trabalho real.',
        updatedAt: stamp,
        recordedAt: stamp,
        before,
        after,
      },
    ]);
  }
}
assert.equal(projects.length, 7);
assert.equal(records.length, 44);
assert.equal(new Set(docs.map(([p]) => p)).size, docs.length);
for (const r of records) {
  assert([uid, secondUid].includes(r.uid));
  assert(projects.some((p) => p.id === r.projectId));
  assert(r.id.startsWith(prefix));
}
for (const [path] of docs) assert(path.split('/').at(-1).startsWith(prefix));
if (args.includes('--json')) {
  console.log(JSON.stringify({ projectId, docs }));
  process.exit(0);
}
console.log(
  JSON.stringify(
    {
      mode: write ? 'LOCAL-WRITE' : 'DRY-RUN-NO-NETWORK',
      projectId,
      projects: projects.length,
      records: records.length,
      audits: docs.length - projects.length - records.length,
      open: records.filter((r) => !r.endedAt).length,
      uids: new Set(records.map((r) => r.uid)).size,
      dates: '2026-10-01..2026-10-09 America/Sao_Paulo',
      policy: 'create-only; no overwrite/delete/auth mutations; all synthetic',
    },
    null,
    2,
  ),
);
if (write) {
  // Hardcoded loopback REST only. No credentials, Admin SDK or production fallback.
  const base =
    host + '/v1/projects/' + projectId + '/databases/(default)/documents/';
  function value(v) {
    if (v === null) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number')
      return Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, value(x)]),
        ),
      },
    };
  }
  let created = 0,
    skipped = 0;
  for (const [path, data] of docs) {
    const slash = path.lastIndexOf('/'),
      collection = path.slice(0, slash),
      id = path.slice(slash + 1);
    const response = await fetch(
      base + collection + '?documentId=' + encodeURIComponent(id),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer owner',
        },
        body: JSON.stringify({
          fields: Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, value(v)]),
          ),
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (response.status === 409) {
      skipped++;
      continue;
    }
    if (!response.ok)
      throw Error(
        'Local create failed ' +
          path +
          ': ' +
          response.status +
          ' ' +
          (await response.text()),
      );
    created++;
  }
  console.log(
    JSON.stringify({
      created,
      skipped,
      productionContacted: false,
      authModified: false,
    }),
  );
}
