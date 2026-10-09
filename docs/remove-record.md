# remove_record — logical removal, no resurrection

## Human-authorized flow

Call get_instructions, resolve the own canonical record, then call remove_record with recordId, stable requestId and reason (3–6000 characters). Preview is read-only by default. Present the source and impact warning, ask for explicit human confirmation, and only then use confirmed:true with the same requestId, reason and previewToken. A stale token requires another preview and confirmation. No physical delete, invented end, automatic linked-record deletion or restore/undo is implemented.

Source UID must match the authenticated UID. Foreign/missing records return generic not-found. An owned orphan or currently inaccessible-project record may be removed without consulting project ACLs: only own evidence is returned; no project metadata is disclosed or modified. The MCP route registers this tool only for a valid authenticated UID. Annotation is destructive, not read-only, and idempotent.

## Atomic storage and retry

The transaction updates only deletedAt (ISO), deletedBy, deleteReason, deleteOperationId, updatedAt and updatedBy. All factual times, topics, originalText, interpretation, snapshots, registration requestId/fingerprint and prior audits remain intact. Closed records remain factual evidence; open records remain open evidence, never assigned an invented end.

An Admin-only users/{uid}/removalAudits/{operationId} ledger and source audit/remove_{operationId} document preserve full before/after evidence. Operation ID is SHA256 of UID, remove and requestId; token binds intent, UID, source contents and updateTime. Audit size is conservatively rejected above700000 serialized bytes before any writes. Firestore rollback leaves source and both audit paths untouched. Exact confirmed retries are accepted only with identical intent/token and current owned source equal to the saved after-state. Changed/deleted/missing source never resurrects. Register duplicate retries against tombstones fail, rather than create or return an active activity.

## Functional read exclusion matrix

Any non-null/non-undefined deletedAt marks a tombstone, including malformed values (0, false, arrays, objects). Legacy absent/null markers remain active. Do not use a Firestore != query: missing legacy fields would be lost.

| Surface                                                              | Exclusion rule                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project/personal/company report page and global context repositories | Filter raw documents before date/topic parsing; physical scanned cursor continues across all-deleted pages.                                                |
| Global estimates and report builders                                 | Filter page and context before consistency, next-start boundaries, tiny-record checks, closed facts, 4h/open estimate and global480min/day budget.         |
| Daily-hours own canonical reader and calculator                      | Filter before normalization, project visibility, intervals, counts and budgeting; physical pages still advance.                                            |
| Topic breakdown                                                      | Removed sources cannot be attributed or become unassigned activity.                                                                                        |
| Legacy project record listing and own open list                      | Filter before returned active limit; no >100 deleted-prefix starvation.                                                                                    |
| Project merge preview/execute                                        | Only active records count/migrate; all-deleted sources finish with zero migrated. Tombstones retain historical source project and removal ledger equality. |
| register closePrevious, pause automatic selection                    | Filter before eligibility and active context caps; explicit deleted source rejects.                                                                        |
| update_record, pause, split and their retries                        | Reject tombstones or changed exact replay state; no write or evidence edit.                                                                                |
| Frontend owner history, pending/dashboard/reports/drawers/exports    | Lead-owned frontend exclusion; no trash/restore UI introduced.                                                                                             |

Admin forensic reads, audit history and remove_record receipts intentionally retain tombstone data. These are evidence, not functional activity totals or list output.

## Limits and operational tradeoffs

Legacy list/open selection, project merge and previous/pause candidate paths scan the full relevant snapshot before active limits. This deliberately requires no index/backfill and ensures tombstones never consume active output caps. Merge writes remain bounded at100 active records per transaction. Full query reads can increase latency, memory and billed reads; this is not an unbounded-scale guarantee. Firestore transaction/read-size/time/resource limits still apply and fail atomically. No migration, deploy, rules changes or production data access accompanies this increment.

The established personal-v3 estimate remains 4h/open and480min/day; six-hour estimates are not authorized. Tests use SDK-boundary mocks, not production or emulator verification.
