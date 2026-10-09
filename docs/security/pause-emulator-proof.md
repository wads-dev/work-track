# Pause SDK emulator proof — separate future tooling

This proof validates the compiled main-worktree pause repository (pause commit `c9d69a2`, separate from pending production release `4d42a63`). Backend-only TypeScript compilation was performed locally; no artifacts were copied into the served emulator runtime and no pause deployment occurred.

The [guarded probe](../../scripts/pause-emulator-probe.mjs) imported the compiled pause repository and matching Firebase Admin dependency via `createRequire`. It targeted only Firestore emulator `127.0.0.1:8081`, project `demo-work-track`, using new random-prefix documents. It made no functions calls and did not touch historical records or UI fixtures.

## Observed successful run

Prefix: `pause-probe-1be306de-e4c3-4fd6-88bb-4f96bcc6288b`. Explicit test clock and timestamps used UTC on 2026-10-09.

- Source began at **09:00Z**. An explicit retrospective 60-minute pause with resumption at **12:00Z** closed it at **11:00Z** and created one successor starting at **12:00Z**.
- Original text, interpretation, timezone, topic percentages, project snapshot, and topic snapshots were preserved in the successor. Source original text and received-at evidence were unchanged.
- Successor lineage referenced the source. Immutable audit before/after snapshots matched persisted source and successor documents.
- Exact retry with a server clock advanced **25 hours** returned the same result rather than duplicating or rejecting the already completed intent.
- A distinct intent against a source older than 24 hours was rejected. That source, record count, and audit count remained unchanged.
- `finally` cleanup removed all **5** probe documents: project, original source, old source, successor, and pause audit.

## Limitations

This actual SDK/transaction proof is not production verification, OAuth transport verification, or a Rules/client-read proof. Pause audits remain Admin-only under unchanged rules and are not shown in the existing record drawer. Prospective “vou pausar” routing is covered by source instructions/tool tests, not by this SDK probe. The pending production deployment excludes pause tooling.
