# Project privacy: prototype client Security Rules

## Scope and contract

This local change covers [Firestore rules](../../firestore.rules) and an
[isolated rules harness](../../scripts/project-privacy-rules.test.mjs) only.
No deployment, main emulator reset/restart, dependency installation, fixture
change, or backend/frontend mutation was performed by the rules-author.

Every permitted client read requires a Firebase Auth token with a string email
in the exact case-insensitive `@wads.dev` domain, `email_verified == true`, and
`firebase.sign_in_provider == 'google.com'`. Missing or malformed claims deny.
Production Firebase Auth verifies tokens; the rules do not trust request fields
as identity or use hardcoded privileged client accounts.

| Resource/operation                                           | Client permission after company authentication                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `projects/{id}` get, `type: personal`                        | Only `createdBy == request.auth.uid`; owner must be a nonempty string of at most 128 characters |
| Project get, missing/null/malformed personal owner           | Deny to everyone                                                                                |
| Project get, `type: work`                                    | Company shared, independent of creator                                                          |
| Project get, missing `type`                                  | Legacy work, preserving existing explicit organizational sharing                                |
| Project get, any other `type` (including null)               | Deny to everyone                                                                                |
| Project list/query, including owner/work filters             | Deny; use authorized `listProjects` callable                                                    |
| `users/{uid}/records/{id}` get/list for path owner           | Allow complete own history, including personal, malformed and orphaned records                  |
| Other user's canonical record get                            | Allow only if a valid `projectId` resolves to an existing current work/legacy-work project      |
| Other user's record list/query                               | Deny, even when filtering a work project                                                        |
| Record `audit` get/list                                      | Only canonical record path owner; not project owner or company coworkers                        |
| Any client `collectionGroup('records')` query                | Deny, including UID-filtered collection-group queries                                           |
| Project nested topics/audit/merges/records                   | Deny; current topics are embedded in the project document and inherit project privacy           |
| User profiles, OAuth credentials/state, unknown/nested paths | Default deny                                                                                    |
| Client create/update/delete anywhere                         | Deny, including owner/type/projectId flips and audit edits                                      |

A record's denormalized `uid`, `type`, and `projectSnapshot` do not authorize
cross-user access. Authorization follows its current project document, not a
stale snapshot; project disappearance or invalid type removes coworker access.
Project IDs use the existing registration contract `[A-Za-z0-9_-]{1,128}` to
avoid accepting path-like references. Record ownership follows the canonical
path, not a spoofable payload field. An owner's malformed/orphaned history is
intentionally still readable for reconciliation.

`confidential` is presentation-only, not an ACL. A confidential work project
remains company-shared; a personal project is private regardless of that flag.
Firestore permissions are document-wide: embedded topics, GitHub URL and other
metadata cannot be selectively hidden after granting a project get.

## Trusted Admin handoff (outside this write scope)

Admin SDK bypasses rules. Backend authorization must independently enforce the
same verified company identity and privacy checks for registration, topic
creation, project updates/archive/merge, discovery/search, records and reports.
`createdBy` must be assigned from verified caller UID on creation, never copied
from client input, never silently rewritten by collaborators; ownership must
remain Admin-controlled. Type changes are trusted operations that can reveal
an entire project/history and require explicit authorized intent and audit.
Rules cannot constrain a privileged Admin SDK caller.

Rules are not filters. The old unrestricted frontend project query is deliberately
not supported; do not widen the ACL to restore it. Backend/front-end teammates
own the authorized `listProjects` callable and its consumption. The owner
record query remains supported, including document-ID ordering and pagination.
Project discovery and report-wide reads belong to authorized server endpoints,
not client-wide collections or recursive collection-group grants.

## Isolated, dependency-free real rules tests

`@firebase/rules-unit-testing` was not installed. The harness uses Node built-ins,
native Firestore REST and an existing cached Firestore emulator JAR. Two distinct
synthetic UIDs (`privacy-alice`, `privacy-bob`) exercise real rules evaluation.
Each denial asserts **HTTP 403 and PERMISSION_DENIED**, rather than accepting an
arbitrary emulator/index/transport failure. Positive assertions require HTTP
200 and verify own complete-history results/embedded topics.

The harness always starts and owns a new Java emulator, binds an ephemeral
loopback port, uses `demo-project-privacy-rules`, and does not honor
`FIRESTORE_EMULATOR_HOST`. It never connects to the currently running designer
instance. Only synthetic fixtures in that child emulator are seeded using its
Admin bypass token. `after` terminates the child even on test failure; no import,
export, shared volume, or persistence is configured.

JWTs are the emulator's unsigned mock-Auth format, with issuer/audience/sub and
Firebase provider claims. This tests rules authorization under supplied claims,
**not** production token signatures, actual Google sign-in, callable authorization,
or end-to-end frontend behavior.

### Reproduce without changing dependencies or existing services

Node 22, Java 21 and an already cached compatible JAR are required. Native host
Java here was 17; the existing local image `pointcontextsaver-firebase:latest`
already provides Java 21, so the run used that image without pulling/building it.
From the repository root:

```sh
docker run --rm --pull=never \
  --name pcs-privacy-rules-local \
  --network none --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --workdir /tmp --entrypoint node \
  -e PROJECT_PRIVACY_EMULATOR_JAR=/emulator.jar \
  -v "$HOME/.cache/firebase/emulators/cloud-firestore-emulator-v1.21.0.jar:/emulator.jar:ro" \
  -v "$PWD/firestore.rules:/workspace/firestore.rules:ro" \
  -v "$PWD/scripts/project-privacy-rules.test.mjs:/workspace/scripts/project-privacy-rules.test.mjs:ro" \
  pointcontextsaver-firebase:latest \
  --test --test-reporter=tap /workspace/scripts/project-privacy-rules.test.mjs
```

No host ports are published; both repository mounts are read-only; emulator
files/logs exist only in disposable container tmpfs. `--pull=never` prevents
unexpected image downloads. If a runtime prerequisite is missing, report that
concrete block; do not silently install or reuse the main emulator.

With suitable existing host Java, alternatively run from a disposable temporary
working directory to keep emulator logs outside the repository:

```sh
PROJECT_PRIVACY_EMULATOR_JAR=/absolute/path/to/cached-emulator.jar \
  node --test /absolute/path/to/repo/scripts/project-privacy-rules.test.mjs
```

### Observed evidence

Final execution on 2026-10-09: **250 passed, 0 failed, 0 skipped/cancelled**
(249 security cases plus the enclosing test), **exit code 0**, 3.465 seconds.

- Collected managed job: `bash-194` (previous passing run `bash-190` also collected).
- Final disposable container: `pcs-privacy-rules-20261009-s2` (removed on completion).
- Project: `demo-project-privacy-rules`; child endpoint: `127.0.0.1:42741`; Java PID 23
  inside that isolated container, not a host or main-designer PID.
- Existing cached JAR: Firestore emulator v1.21.0; existing image ID:
  `sha256:1f54700bfab90457e9b102c9b2b0a62acacacdd6268300738187ce6e933b96f7`.
- Final read-only runtime inspection still showed designer container
  `9e71fceade20` / `pointcontextsaver-firebase-1`, with no privacy test container.
- `node --check scripts/project-privacy-rules.test.mjs` and scoped
  `git diff --check` both exited 0.

This is actual emulator rules execution, not only a string/regex assertion on
the rules source; it does not claim production deployment or privileged API tests.

Coverage: owner/coworker personal get, work/legacy get, malformed enum/owner,
project list/query/filtered query, own whole-history and ordered query,
other-personal/invalid/orphan record gets, work record gets, cross-user lists,
collection-group queries, nested topics/audit, strict record-owner audit,
OAuth/default deny, all client writes including privacy flips, anonymous,
unverified, wrong provider/domain and missing claims. A trusted fixture type
change from work to personal/invalid/deleted confirms that coworker record access
tracks the live project rather than a spoofed record field or stale snapshot.

## Auditor assessment (client rules only)

The confirmed old broad company reads exposed personal project documents and
canonical transcripts. This finding is fixed locally by the explicit get/list
split, owner personal gate, live-work lookup and default denial of other paths.
No client write validation helper is exposed because **all client writes deny**;
size/schema validation of privileged mutations remains the backend's duty.

```json
{
  "score": 5,
  "summary": "Scoped prototype client ACL: default deny; verified company Google identity; personal project owner-only; live work lookup for coworker canonical record gets; complete owner history; owner-only audit; no client writes or collection-group reads. This is not an audit of privileged backend endpoints.",
  "findings": []
}
```

I've set up prototype Security Rules to keep the data in Firestore
safe. They are designed to be secure for owner-only personal projects, verified
company work sharing, complete owner history, strict owner audit, and denial of
all client mutations and unknown paths. However, you
should review and verify them before broadly sharing your app. If you'd like, I
can help you harden these rules.
