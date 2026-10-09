import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const stage = process.argv[2];
assert(['functions', 'all'].includes(stage), 'Use functions or all');
const base = 'https://wadsworktrack.web.app';
const client = new Client({
  name: 'work-track-pending-readonly-verification',
  version: '0.1.0',
});
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', 'mcp-remote', base + '/mcp', '--auth-timeout', '600'],
  env: { ...process.env, MCP_REMOTE_CONFIG_DIR: resolve('.mcp-auth') },
  stderr: 'inherit',
});
try {
  await client.connect(transport, { timeout: 660000 });
  const catalog = await client.listTools();
  const names = catalog.tools.map((t) => t.name).sort();
  for (const name of [
    'whoami',
    'get_instructions',
    'search_projects',
    'get_daily_hours',
    'merge_topics',
    'list_topic_merges',
  ])
    assert(names.includes(name), 'Missing tool ' + name);
  assert(
    !names.includes('register_pause'),
    'Separate pause release was unexpectedly included',
  );
  const identity = await client.callTool({ name: 'whoami', arguments: {} });
  assert(!identity.isError, 'Authenticated identity failed');
  const instructions = await client.callTool({
    name: 'get_instructions',
    arguments: {},
  });
  assert(!instructions.isError, 'Instructions unavailable');
  const dailyTool = catalog.tools.find((t) => t.name === 'get_daily_hours');
  assert.equal(dailyTool.annotations.readOnlyHint, true);
  const daily = await client.callTool({
    name: 'get_daily_hours',
    arguments: { date: '2000-01-01', timeZone: 'America/Sao_Paulo' },
  });
  assert(!daily.isError, 'Daily hours failed');
  const data = JSON.parse(daily.content.find((c) => c.type === 'text').text);
  assert.equal(data.date, '2000-01-01');
  assert(Number.isFinite(data.totalMinutes));
  const invalid = await client.callTool({
    name: 'get_daily_hours',
    arguments: { date: '2026-02-30' },
  });
  assert(invalid.isError, 'Impossible date accepted');
  const search = await client.callTool({
    name: 'search_projects',
    arguments: { query: 'release-readonly-no-match-09-oct-2026' },
  });
  assert(!search.isError, 'Project search failed');
  console.log(
    JSON.stringify({
      authenticatedMcp: 'PASS',
      toolNames: names,
      pauseExcluded: true,
      daily: {
        date: data.date,
        totalMinutes: data.totalMinutes,
        closedMinutes: data.closedMinutes,
        estimatedMinutes: data.estimatedMinutes,
      },
      invalidDateRejected: true,
      authorizedSearch: 'PASS',
    }),
  );
} finally {
  await client.close();
  await transport.close();
}
for (const name of [
  'listProjects',
  'getPersonalReport',
  'getCompanyReport',
  'getProjectReport',
  'createProject',
  'mergeProjects',
  'mergeTopics',
  'listTopicMerges',
]) {
  const response = await fetch(
    'https://southamerica-east1-wadsworktrack.cloudfunctions.net/' + name,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await response.json();
  assert.equal(
    response.status,
    401,
    'Unauthenticated callable not denied: ' + name,
  );
  assert.equal(data.error?.status, 'UNAUTHENTICATED');
}
console.log('UNAUTHENTICATED_CALLABLES_DENIED_PASS');
const health = await fetch(base + '/health', {
  signal: AbortSignal.timeout(30000),
});
assert(health.ok, 'Health failed');
console.log('HEALTH_PASS');
if (stage === 'all') {
  const index = await fetch(base + '/?release=4d42a63', {
    signal: AbortSignal.timeout(30000),
  });
  const html = await index.text();
  assert(
    index.ok && html.includes('index-C_AShFyv.js'),
    'Hosting release hash mismatch',
  );
  const asset = await fetch(base + '/assets/index-C_AShFyv.js', {
    signal: AbortSignal.timeout(30000),
  });
  assert(asset.ok, 'Hosting JS unavailable');
  const config = await fetch(base + '/__/firebase/init.json', {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal((await config.json()).projectId, 'wadsworktrack');
  console.log('HOSTING_EXACT_RELEASE_C_AShFyv_PASS');
}
