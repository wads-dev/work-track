# Two-user project privacy integration (local only)

**Status: local runtime PASS, 2026-10-09 03:25–03:26 America/Sao_Paulo.**

Lead publicou artefatos compilados no container existente, sem restart, produção ou deploy. A execução `node scripts/project-privacy-integration.test.mjs --run --confirm-local-demo` terminou **exit0**, **31 checks**, **12 documentos exclusivos**, marker `lead-privacy-probe-2d0d1e56-50ce-4a7e-8633-ee08e31cab48`. O finally concluiu cleanup dos documentos e das duas identidades sintéticas sem erro. Backend callable real e SDK local usaram os mesmos artefatos compilados; frontend D servido `index-BTkKlKSR.js`. Houve aviso MetadataLookupWarning local no SDK durante descoberta de ambiente; não houve falha nas verificações ou cleanup. Não é prova de OAuth MCP HTTP nem assinatura Google de produção.

Run from the repository root, only against the existing local `demo-work-track` emulators. No dependencies, emulator restart, build, deploy, browser, production credentials or migration are performed by the script. Compiled backend artifacts must already match current source. Callable server artifacts and local imported artifacts must both be current; only Lead publishes them.

## Commands

Syntax/dry-run commands are safe without runtime approval; the final command requires Lead GO:

```sh
node --check scripts/project-privacy-integration.test.mjs
node scripts/project-privacy-integration.test.mjs
# Lead-approved runtime only, same existing environment:
node scripts/project-privacy-integration.test.mjs --run --confirm-local-demo
```

Default invocation performs no backend imports, network requests or writes. The explicit runtime mode fixes Firestore to 127.0.0.1:8081, Auth to 127.0.0.1:9099 and callables to http://127.0.0.1:5001/demo-work-track/southamerica-east1. In a container these ports must resolve inside that same container; this script does not bridge Docker networks or start services. Conflicting project/emulator environment, credential files, unknown arguments and HTTP redirects fail closed. Admin SDK resolves from existing backend dependencies.

## What it checks

- Fresh synthetic Google signInWithIdp Auth emulator identities with verified @wads.dev claims; token verification and callable HTTP authentication for two UIDs.
- Required creation type rejects omission; caller-supplied owner is ignored; same-title personal IDs use trusted owner namespace; work IDs reuse the normalized-title hash and are shared. Only fresh unique lead-privacy-probe- titles are used.
- Authenticated paginated catalog and compiled MCP adapter search hide the other owner's project; hidden cursor rejected; direct report access and absent project return the same generic not-found message.
- Private create-topic/register MCP attempts and metadata/archive/topic preview/history/project merge callable attempts denied; own scope flip and cross-scope merge rejected.
- Cached metadata/archive audit entries owned by the attacking UID still cannot bypass current project access checks.
- Closed synthetic work fact provides a deterministic baseline. Adding private closed/open facts cannot change the work-filtered company report, including totals, counts, warnings and estimates (only asOf/generatedAt timestamps are excluded from equality).
- An intentionally malformed foreign private fact cannot poison company report parsing/context. Broad company output excludes both own and foreign personal projects. Personal report does not expose the other UID/project.

## Safety and cleanup

Each run uses a fresh random marker and synthetic users. Exactly twelve explicit Firestore paths are reserved: three projects, three creation audits, two tempting cached audits, one work record, two personal records, one malformed personal record. Every reserved path is checked absent before its operation; project IDs are calculated and checked before callable creation. A finally block deletes **only those explicitly reserved paths**, then only the two new Auth UIDs; there is no title lookup, collection deletion, recursive deletion or emulator reset. Failure reports cleanup ledger entries. Do not kill the process during cleanup; abnormal termination cannot guarantee removal. If interrupted, locate paths from its unique marker and review individually; never delete an entire collection. The integration assumes no concurrent writer targets its fresh random identifiers.

## Evidence limits

The successful local runtime above proves only the covered emulator/adapter paths, not all authorization surfaces. A PASS includes marker, assertion count and twelve-document ledger count. Source-only syntax/dry-run checks are not privacy evidence. The MCP probe invokes the compiled registered tool callback/schema with real Firestore and a trusted UID, **not MCP HTTP/OAuth token transport**. Google claims are emulator synthetic identity proof, not production signature validation. Firestore client security rules have their separate probe. No same-owner project merge execution, record-edit retry, topic merge execution, race/TOCTOU stress, production or browser evidence is claimed. Existing global fixture records may make the broad company report fail for genuine unrelated malformed/shared context; the deterministic work-filtered before/after assertion is the scoped privacy comparison, not a fixture reset.

For review: [probe](../../scripts/project-privacy-integration.test.mjs).
