# Personal merge owner isolation evidence

## Scope

The personal-project merge repository now queries only `users/{source.createdBy}/records`, with equality filters on both `projectId` and `uid`. Preview and execution use this same owner-scoped query after project ACL validation. Execution additionally checks the canonical path and personal owner before preparing migration writes. Work/legacy project collection-group behavior is unchanged.

The patch changes only the project-management repository and its focused owner-isolation regression. It does not change Firestore rules, report behavior, UI history, or pause tooling. The pending release under review is `4d42a63`; pause tooling is separate and was not part of this runtime proof or deployment.

## Source validation

Backend TypeScript typecheck, scoped ESLint, formatting, and diff checks passed. The focused owner-isolation regression and existing work merge regression passed. The isolation fixture contains 101 owner records, one foreign canonical record referencing the private source project, and one owner-path record with a spoofed foreign UID. Foreign and spoofed records are excluded from preview and migration.

## Actual SDK emulator proof

The guarded [probe](../../scripts/personal-merge-emulator-probe.mjs) imported the exact compiled pending-release project-management repository and its matching Firebase Admin dependency instance. It ran against Firestore emulator `127.0.0.1:8081`, project `demo-work-track`, with fresh random-prefix documents only. No functions endpoint, production database, historical record, or UI privacy fixture was used.

Successful run prefix: `merge-probe-5e3d7fce-79e2-4d7f-ad25-8e8e221fad2d`.

Observed assertions:

- Preview count was **101**, not 103.
- First transaction batch migrated **100** records; second completed at **101 cumulative**.
- Exact retry returned the same completed result.
- The foreign canonical record and owner-path UID-spoof record remained unchanged.
- The owner collection query with both equality filters executed successfully.
- `finally` cleanup removed **207 documents**: 2 projects, 103 record facts, 101 record audits, and 1 merge job. Cleanup was limited to explicitly constructed random-prefix roots.

An initial credential-initialization failure occurred before database writes. A second attempt encountered incompatible Firestore transform identity from separate dependency copies after seeding; its `finally` cleanup removed all **105** seeded documents. The successful attempt used the compiled release dependency identity. These failures were investigated, not reported as successful proof.

## Limitations

This is an actual emulator SDK/transaction proof, not a production mutation or production index test. Emulator success does **not** establish production index availability or enforcement. No production guarantees are inferred from it. Rules-based client access and OAuth transport were not exercised by this Admin SDK probe. Pause runtime behavior was not exercised. UI privacy fixtures remain separate and are held until designer E completion.
