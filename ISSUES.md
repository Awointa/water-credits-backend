# Open Issues

> High-impact, technically substantive issues for experienced contributors.
> These are not good-first-issues — each requires real repo knowledge and intermediate-to-advanced TypeScript/NestJS/Stellar skills.

---

## Issue #1 — Wire `OracleProcessor` to `StellarService` and fix nonce race condition blocking testnet integration

**Labels:** `type: bug` · `type: feature` · `area: oracle` · `area: stellar` · `difficulty: advanced`
**Reward tier:** 🔴 High

---

### Why this matters now

The v0.2 milestone explicitly targets _"live Soroban testnet integration end-to-end."_ Right now `oracle-processor.ts` generates a fake `tx-{Date.now()}-{nonce}` hash, marks the submission `CONFIRMED`, and never touches the network. Additionally, `getNextNonce()` uses an unlocked `findOne` — concurrent triggers (cron + manual API call) will silently produce duplicate nonces, causing every second Soroban transaction to be rejected with a DB uniqueness violation that surfaces as an unhandled 500. Fixing both is the minimum viable change to make the oracle pipeline do anything real on testnet.

---

### Problem / What

`OracleProcessor.processSubmission()` (`src/modules/oracle/oracle-processor.ts`) is a placeholder. It:

- Never injects or calls `StellarService`
- Sets `txHash` to a local timestamp string
- Immediately transitions `SUBMITTED → CONFIRMED` without waiting for ledger confirmation

Separately, `OracleService.getNextNonce()` (`src/modules/oracle/oracle.service.ts`, lines 184–191) reads the max nonce with a bare `findOne` and returns `+1`. There is no pessimistic lock, no `SELECT FOR UPDATE`, and no uniqueness enforcement at the application layer. The database has a `(oracle_address, nonce)` uniqueness constraint in migration `005`, but the race window means two concurrent workers will both read the same last nonce, both try to insert with `nonce + 1`, and one will throw an unhandled DB exception.

---

### Why it's hard

- `StellarClient.sendTx()` is an async polling loop (up to 30 attempts × 2s = 60s). The Bull job must tolerate this without timing out, and the status transitions (`PENDING → SUBMITTED → CONFIRMED/FAILED`) must be persisted correctly even if the process restarts mid-poll.
- The nonce fix requires either a `SELECT ... FOR UPDATE` (TypeORM query runner with transaction), a Redis-based distributed lock, or a DB-level advisory lock — each with different tradeoffs for a concurrency-1 queue worker vs. future multi-node deployments.
- The processor currently has no access to `StellarService` because `OracleModule` does not import `StellarModule`. That wiring requires understanding the module graph and avoiding circular dependencies.
- `submitReading()` in `stellar.service.ts` accepts a simplified `{ value: number }` shape. The processor must aggregate `readingsSnapshot` from the DB into the correct structure before calling it — a design decision that touches the service boundary.

---

### Acceptance Criteria

- [ ] `OracleProcessor` injects `StellarService` and calls `stellarService.submitReading()` with arguments derived from `submission.readingsSnapshot`
- [ ] Job status transitions are: `PENDING → SUBMITTED` (after `sendTx` returns) → `CONFIRMED` (ledger success) or `FAILED` (ledger failure or timeout)
- [ ] `txHash` is set to the real Stellar transaction hash from `SorobanRpc.Api.GetTransactionResponse`
- [ ] `getNextNonce()` is safe under concurrent invocations — duplicate nonce inserts must not produce unhandled 500s; the second caller must either retry or receive a meaningful error
- [ ] Unit test covers the nonce collision path: two concurrent `triggerSubmission` calls must not both succeed with the same nonce
- [ ] Unit tests cover the processor's `SUBMITTED → CONFIRMED` and `SUBMITTED → FAILED` transitions with a mocked `StellarService`
- [ ] Fix works with `QUEUE_CONCURRENCY_ORACLE_SUBMIT=1` and must not break if that value is raised to 2 in future

---

### Relevant files / functions

| File | Notes |
|---|---|
| `src/modules/oracle/oracle-processor.ts` | Stub processor — main target |
| `src/modules/oracle/oracle.service.ts:184–191` | `getNextNonce()` race condition |
| `src/modules/oracle/oracle.service.ts:95–130` | `triggerSubmission()` — calls `getNextNonce()`, queues the job |
| `src/modules/oracle/oracle.module.ts` | Needs `StellarModule` import added |
| `src/modules/stellar/stellar.service.ts:155–170` | `submitReading()` — the target call |
| `src/modules/stellar/stellar.client.ts:40–75` | `sendTx()` polling loop |
| `src/migrations/005_create_oracle_submissions.sql` | Uniqueness constraint reference |

---

### Out of scope

- Do not change the cron schedule or submission interval
- Do not refactor `StellarService` or `StellarClient` beyond what the wiring requires
- Do not implement IPFS upload or certificate generation (separate v0.2 task)
- Do not change queue retry/backoff configuration

---

### Self-check

> If solved, this issue moves the v0.2 _"live Soroban testnet integration end-to-end"_ goal forward because the oracle pipeline currently never submits a real transaction — this makes it do exactly that, correctly and safely.

---

---

## Issue #2 — Replace stub spec files with meaningful unit tests for oracle, sensor, and credit critical paths (target: 80% coverage)

**Labels:** `type: test` · `area: oracle` · `area: sensors` · `area: credits` · `area: auth` · `difficulty: intermediate`
**Reward tier:** 🟡 Medium-High

---

### Why this matters now

The v0.2 milestone lists _"complete unit test coverage (target 80%)"_ as a named deliverable. Every service spec file is currently a single `should be defined` assertion. The three most security- and correctness-sensitive paths — sensor signature verification, oracle nonce ordering, and credit retirement queueing — have zero coverage. Regressions in these paths are invisible until they hit testnet.

---

### Problem / What

All three primary service specs share the same structure: a module scaffold and one smoke test. None of the business logic is tested.

The specific untested paths that matter most:

- `SensorsService.ingestReading()` — ECDSA signature verification via `Keypair.verify()`, parameter range validation, batch window boundary logic (`resolveBatch()` creates a new batch when the last one is older than 15 minutes)
- `SensorsService.getLatestReading()` without a `deviceId` — issues N+1 queries (one `findOne` per device). No test catches this and no future optimisation has a regression guard.
- `OracleService.triggerSubmission()` — duplicate nonce detection (the `existing` check) and happy-path queue job payload
- `OracleService.aggregateReadings()` — median calculation with even/odd counts, empty arrays, and sparse readings (some parameters missing)
- `CreditsService.retire()` — amount validation, queue job payload shape, and the case where the queue `add` throws after the DB record is already saved (partial failure)
- `AuthService.validateStellarSignature()` — challenge replay (second call with same challenge must fail), expired challenge, wrong wallet, malformed signature

---

### Why it's hard

- `SensorsService.verifySignature()` uses the real `@stellar/stellar-sdk` `Keypair`. Tests need to generate a real keypair, sign a real payload, and exercise both valid and invalid paths — this is not a simple mock.
- The batch window test (`resolveBatch`) requires controlling `Date.now()`. Needs Jest fake timers or an injected clock abstraction, neither of which is currently set up.
- `AuthService` creates its own `Redis` client in `onModuleInit()` rather than accepting an injected one. Proper isolation requires either mocking `ioredis` at the module level or refactoring the service to accept an injected client (a worthwhile design improvement to do as part of this issue).
- The N+1 in `getLatestReading()` should be surfaced as a visible deficiency — a `.todo` test and a `// TODO` comment — without being fixed here (keep scope clean).

---

### Acceptance Criteria

- [ ] `npm run test:cov` reports ≥ 80% statement coverage on `sensors.service.ts`, `oracle.service.ts`, `credits.service.ts`, and `auth.service.ts`
- [ ] Signature verification tests use a real `Keypair` (not a mock), covering: valid signature, invalid signature, and malformed public key
- [ ] Batch window boundary is tested: reading after the 15-minute cutoff creates a new batch; reading within the window reuses the existing batch
- [ ] Median calculation is tested for: even count, odd count, single value, empty array (returns `null`), and sparse readings (some parameters `null`)
- [ ] Challenge replay is tested: submitting the same challenge twice must fail on the second call
- [ ] Partial-failure retirement path (queue throws after DB save) is tested and expected behaviour documented
- [ ] N+1 in `getLatestReading()` is marked with a `// TODO: N+1 — replace with a single query` comment and a `.todo` test describing correct behaviour
- [ ] No test uses `any` casts to bypass TypeScript — all mocks are typed

---

### Relevant files / functions

| File | Notes |
|---|---|
| `src/modules/sensors/sensors.service.spec.ts` | Main target |
| `src/modules/sensors/sensors.service.ts:100–115` | `ingestReading()`, `verifySignature()`, `resolveBatch()` |
| `src/modules/sensors/sensors.service.ts:230–248` | `getLatestReading()` N+1 |
| `src/modules/oracle/oracle.service.spec.ts` | Main target |
| `src/modules/oracle/oracle.service.ts:155–175` | `aggregateReadings()`, `median()` |
| `src/modules/credits/credits.service.spec.ts` | Main target |
| `src/modules/credits/credits.service.ts:62–88` | `retire()` partial failure path |
| `src/modules/auth/auth.service.ts:45–80` | `generateChallenge()`, `validateStellarSignature()`, Redis isolation |

---

### Out of scope

- Do not write e2e tests (those belong in `test/`)
- Do not add tests for controllers, DTOs, or guards in this issue
- Do not fix the N+1 query — only document it
- Do not restructure modules or introduce new abstractions beyond what testability requires

---

### Self-check

> If solved, this issue moves the v0.2 _"complete unit test coverage (target 80%)"_ goal forward because the three core services that handle all on-chain-bound data currently have no meaningful test coverage, making regressions invisible until they hit testnet.
