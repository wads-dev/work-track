/* eslint-disable @typescript-eslint/no-require-imports -- Firebase CLI bootstrap uses its CommonJS internal API. */
const path = require('node:path');
const p = path.resolve(
  '.npm-cache/_npx/ba4f1959e38407b5/node_modules/firebase-tools/lib',
);
const { configstore } = require(p + '/configstore');
const { requireAuth } = require(p + '/requireAuth');
const { Client } = require(p + '/apiv2');
(async () => {
  await requireAuth({
    project: 'wadsworktrack',
    user: configstore.get('user'),
    tokens: configstore.get('tokens'),
  });
  const iam = new Client({
    urlPrefix: 'https://iam.googleapis.com',
    apiVersion: 'v1',
  });
  const crm = new Client({
    urlPrefix: 'https://cloudresourcemanager.googleapis.com',
    apiVersion: 'v1',
  });
  const opts = { headers: { 'x-goog-user-project': 'wadsworktrack' } };
  const parent = 'projects/1048371748954/locations/global';
  const pool = parent + '/workloadIdentityPools/github-actions';
  const sa = 'github-deploy@wadsworktrack.iam.gserviceaccount.com';
  async function ensure(getPath, postPath, body, queryParams) {
    try {
      await iam.get(getPath, opts);
      console.log('Exists:', getPath);
    } catch (error) {
      if (!String(error.message).includes('404')) throw error;
      const r = await iam.post(postPath, body, { ...opts, queryParams });
      console.log('Created:', getPath, r.body.name);
    }
  }
  await ensure(
    pool,
    parent + '/workloadIdentityPools',
    { displayName: 'GitHub Actions' },
    { workloadIdentityPoolId: 'github-actions' },
  );
  await ensure(
    'projects/wadsworktrack/serviceAccounts/' + sa,
    'projects/wadsworktrack/serviceAccounts',
    {
      accountId: 'github-deploy',
      serviceAccount: { displayName: 'GitHub Actions Firebase deploy' },
    },
  );
  await ensure(
    pool + '/providers/work-track',
    pool + '/providers',
    {
      displayName: 'Work Track main only',
      oidc: { issuerUri: 'https://token.actions.githubusercontent.com' },
      attributeMapping: {
        'google.subject': 'assertion.sub',
        'attribute.repository_id': 'assertion.repository_id',
        'attribute.repository_owner_id': 'assertion.repository_owner_id',
        'attribute.ref': 'assertion.ref',
      },
      attributeCondition:
        "assertion.repository_id == '1411074260' && assertion.repository_owner_id == '299704183' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'push'",
    },
    { workloadIdentityPoolProviderId: 'work-track' },
  );
  const resource = 'projects/wadsworktrack/serviceAccounts/' + sa;
  const policy = (await iam.post(resource + ':getIamPolicy', {}, opts)).body;
  policy.bindings ??= [];
  const member =
    'principalSet://iam.googleapis.com/' +
    pool +
    '/attribute.repository_id/1411074260';
  let binding = policy.bindings.find(
    (b) => b.role === 'roles/iam.workloadIdentityUser',
  );
  if (!binding) {
    binding = { role: 'roles/iam.workloadIdentityUser', members: [] };
    policy.bindings.push(binding);
  }
  if (!binding.members.includes(member)) binding.members.push(member);
  await iam.post(resource + ':setIamPolicy', { policy }, opts);
  const projectPolicy = (
    await crm.post('projects/wadsworktrack:getIamPolicy', {}, opts)
  ).body;
  for (const role of [
    'roles/cloudfunctions.admin',
    'roles/firebasehosting.admin',
    'roles/firebaserules.admin',
    'roles/datastore.indexAdmin',
    'roles/serviceusage.serviceUsageConsumer',
    'roles/firebase.viewer',
    'roles/artifactregistry.admin',
  ]) {
    let b = projectPolicy.bindings.find((b) => b.role === role && !b.condition);
    if (!b) {
      b = { role, members: [] };
      projectPolicy.bindings.push(b);
    }
    if (!b.members.includes('serviceAccount:' + sa))
      b.members.push('serviceAccount:' + sa);
  }
  await crm.post(
    'projects/wadsworktrack:setIamPolicy',
    { policy: projectPolicy },
    opts,
  );
  const runtime =
    'projects/wadsworktrack/serviceAccounts/1048371748954-compute@developer.gserviceaccount.com';
  const runtimePolicy = (await iam.post(runtime + ':getIamPolicy', {}, opts))
    .body;
  runtimePolicy.bindings ??= [];
  let actAs = runtimePolicy.bindings.find(
    (b) => b.role === 'roles/iam.serviceAccountUser',
  );
  if (!actAs) {
    actAs = { role: 'roles/iam.serviceAccountUser', members: [] };
    runtimePolicy.bindings.push(actAs);
  }
  if (!actAs.members.includes('serviceAccount:' + sa))
    actAs.members.push('serviceAccount:' + sa);
  await iam.post(runtime + ':setIamPolicy', { policy: runtimePolicy }, opts);
  console.log('OIDC configured without service account keys.');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
