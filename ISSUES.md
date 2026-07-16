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

## Issue #2 — Fix sensor API key authentication: per-device bcrypt verification is never called, global key bypass defeats the entire security model

**Labels:** `type: bug` · `area: sensors` · `area: security` · `difficulty: intermediate`
**Reward tier:** 🔴 High

---

### Why this matters now

The v0.1 README documents sensor authentication as _"API keys stored hashed (bcrypt) in database, associated with a device."_ The implementation generates per-device keys with bcrypt hashing (`api-key.util.ts`) and even stores a `SensorDevice.apiKeyHash` column. But the actual authentication in `SensorsController.ingestReading()` compares the raw `x-api-key` header against a single **global** config value (`app.sensorApiKey`), completely bypassing `verifyDeviceApiKey()`. The bcrypt hash infrastructure is functionally dead code. This means: any sensor with the single shared key can submit readings for any project, device impersonation is trivially possible, and the per-device key rotation/revocation model the README promises doesn't exist. This must be fixed before any testnet data is considered meaningful.

---

### Problem / What

`SensorsController.ingestReading()` (`src/modules/sensors/sensors.controller.ts:30–40`):

```typescript
const expectedKey = this.configService.get<string>('app.sensorApiKey');
if (expectedKey && apiKey !== expectedKey) {
  throw new UnauthorizedException('Invalid API key');
}
```

This is a string equality check against one environment variable. The `verifyDeviceApiKey()` function in `src/common/utils/api-key.util.ts` — which does the correct bcrypt comparison against the per-device hash — is **never called anywhere in the request path**.

The consequence:

- All registered devices share one authentication credential
- A compromised key compromises every device simultaneously
- Device deregistration/rotation has no effect on authentication
- The `deviceId` in the request body is fully trusted with no cryptographic binding to the API key — any caller with the global key can forge readings for any `deviceId`
- `SensorDevice.apiKeyHash` is populated on registration but never read on ingestion

---

### Why it's hard

- The correct fix requires loading the `SensorDevice` record **before** validating the key, which means the controller needs a database lookup in the auth path — the lookup must be efficient (device ID is already indexed) and must not leak timing information (bcrypt compare must run even for unknown device IDs to prevent enumeration)
- The `@Public()` decorator bypasses `JwtAuthGuard` entirely on this route; the per-device key check must replace JWT auth cleanly without removing the `@Public()` designation (sensors don't have user accounts)
- The `deviceId` is currently in the request body (`CreateReadingDto`), not the header. The auth check needs to bind the presented API key to the specific device identified in the body — after parsing the body but before executing business logic. This either requires a custom guard that can access `req.body`, or moving `deviceId` to a header, or extracting the device lookup into the guard via `ExecutionContext`
- The `verifyDeviceApiKey()` function extracts the secret by splitting on `_` and taking the last segment (`parts[parts.length - 1]`). This means the key format `wc_<deviceId>_<secret>` is load-bearing — a device whose `deviceId` contains underscores will silently extract the wrong secret segment. This edge case must be handled or the key format must be changed
- Timing-safe comparison: `bcrypt.compare` is already timing-safe for the hash comparison, but the device lookup itself (found vs. not found) creates a timing difference that could be exploited for device ID enumeration. The fix should run `bcrypt.compare` against a dummy hash on miss

---

### Acceptance Criteria

- [ ] `ingestReading()` authenticates using the per-device `apiKeyHash` from `SensorDevice`, not a global config value
- [ ] `verifyDeviceApiKey()` is called in the request path for every `POST /sensors/readings` request
- [ ] A valid key for device A cannot authenticate a reading submitted with `deviceId: B`
- [ ] An unknown `deviceId` triggers a bcrypt compare against a constant dummy hash (prevents timing-based device enumeration)
- [ ] Device IDs containing underscores are handled correctly (or explicitly rejected at registration)
- [ ] The global `app.sensorApiKey` config value is removed or documented as deprecated
- [ ] Unit test: valid key + correct deviceId → accepted
- [ ] Unit test: valid key + wrong deviceId → rejected
- [ ] Unit test: invalid key + correct deviceId → rejected
- [ ] Unit test: unknown deviceId → rejected (and takes approximately the same time as a known-device rejection)
- [ ] The `@Public()` decorator remains on the route; sensor ingestion does not require a JWT

---

### Relevant files / functions

| File | Notes |
|---|---|
| `src/modules/sensors/sensors.controller.ts:30–40` | Broken auth — main target |
| `src/common/utils/api-key.util.ts` | `verifyDeviceApiKey()` — never called on ingestion path |
| `src/modules/sensors/sensors.service.ts:60–90` | `registerDevice()` — generates and stores the hash correctly |
| `src/modules/sensors/entities/sensor-device.entity.ts` | `apiKeyHash` column |
| `src/modules/sensors/dto/create-reading.dto.ts` | `deviceId` is in the body |
| `src/config/app.config.ts` | `sensorApiKey` config value to remove/deprecate |

---

### Out of scope

- Do not change the key generation format unless the underscore edge case requires it
- Do not add rate limiting to the sensor ingestion endpoint (separate concern)
- Do not implement key rotation UI or API (beyond what already exists in `registerDevice`)
- Do not add JWT authentication to sensor routes

---

### Self-check

> If solved, this issue moves the v0.3 _"rate limiting and abuse protection hardening"_ goal and the pre-v1.0 _"security audit"_ forward because it closes a fundamental authentication bypass that makes every other sensor security control irrelevant.

---

---

## Issue #3 — Replace stub spec files with meaningful unit tests for oracle, sensor, and credit critical paths (target: 80% coverage)

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

---

## Issue #4 — Fix governance double-vote race condition and missing on-chain execution in `GovernanceService`

**Labels:** `type: bug` · `area: governance` · `area: stellar` · `difficulty: advanced`
**Reward tier:** 🔴 High

---

### Why this matters now

Governance controls protocol parameters that directly affect credit issuance — oracle fee thresholds, quorum sizes, timelock periods. A double-vote exploit allows any authenticated user to pass or reject any proposal by voting twice in a concurrent window, bypassing the quorum mechanism entirely. Separately, `executeProposal()` transitions the proposal to `EXECUTED` in the database but never calls the Soroban governance contract — meaning "executed" proposals have no on-chain effect. Both bugs must be fixed before governance is used on testnet.

---

### Problem / What

**Bug 1 — Double-vote race condition (`governance.service.ts:112–145`)**

`vote()` checks for an existing vote then saves a new one in two separate, non-transactional operations:

```typescript
const existingVote = await this.voteRepo.findOne(...)  // read
// ← race window: two concurrent requests both pass this check
await this.voteRepo.save(voteRecord)                    // write
proposal.votesFor += 1
await this.proposalRepo.save(proposal)                  // write
```

There is no unique constraint on `(proposal_id, voter_wallet)` in the `ProposalVote` entity, no `SELECT FOR UPDATE`, and no database-level uniqueness enforcement. Two simultaneous `POST /governance/proposals/:id/vote` requests from the same wallet will both pass the `existingVote` check and each increment `votesFor`, adding 2 votes from one wallet. On a quorum of 3, this means a single voter can pass any proposal alone with two rapid requests.

**Bug 2 — `executeProposal()` never calls Soroban (`governance.service.ts:147–167`)**

```typescript
proposal.status = ProposalStatus.EXECUTED;
const saved = await this.proposalRepo.save(proposal);
// StellarService is not injected — nothing is submitted on-chain
return saved;
```

`GovernanceModule` does not import `StellarModule`. The timelock check is correct, but the actual contract call (`stellarService.execute(governanceId, proposalId)`) is absent. Proposals "execute" only in the off-chain DB, which means parameter changes (fee basis points, oracle thresholds, quorum) never reach the Soroban governance contract and have no real effect.

**Bug 3 — `votesFor`/`votesAgainst` are in-memory increments on a stale read**

Even without a race, `proposal.votesFor += 1` operates on the object loaded at the start of the request. Under load, two sequential votes can both read `votesFor = 5`, both write `votesFor = 6`, and one vote is silently lost. The correct approach is `UPDATE ... SET votes_for = votes_for + 1` (atomic SQL increment).

---

### Why it's hard

- The double-vote fix requires both a unique DB constraint on `(proposal_id, voter_wallet)` **and** a database-level transaction wrapping the vote insert and proposal update — the constraint alone is not enough because the `proposal.votesFor` increment is a non-atomic read-modify-write
- The atomic increment fix requires switching from `entity.save()` to a TypeORM query builder `UPDATE ... SET votes_for = votes_for + 1 WHERE id = :id` inside the same transaction, then reloading the entity to check the quorum threshold — the reload adds a DB round-trip that must not create a new race window
- `executeProposal()` needs `StellarService` injected, but `GovernanceModule` must import `StellarModule` without creating a circular dependency. The `execute()` call on Soroban takes a `proposalId` as a `u32` but the local entity uses a UUID string — there needs to be either a mapping or a separate `onChainProposalId` field on the `Proposal` entity (which requires a migration)
- The timelock check computes `elapsed` from `proposal.deadline` rather than `proposal.executedAt` or an on-chain timestamp. After the Soroban call is added, the check should be validated against the network's ledger time, not local server time, to prevent clock-skew exploits

---

### Acceptance Criteria

- [ ] A unique constraint exists on `(proposal_id, voter_wallet)` in the `ProposalVote` entity and a corresponding migration is provided
- [ ] The `vote()` method wraps the duplicate check, vote insert, and `votesFor`/`votesAgainst` update in a single database transaction
- [ ] `votesFor` and `votesAgainst` are incremented with an atomic SQL `UPDATE` (not a read-modify-write on the in-memory object)
- [ ] Two concurrent `vote()` calls from the same wallet result in exactly one accepted vote and one `409 Conflict` (or `400 Bad Request`) — verifiable with a unit test using `Promise.all`
- [ ] `executeProposal()` calls `stellarService.execute()` with the correct arguments before updating the local status to `EXECUTED`
- [ ] Local status is only set to `EXECUTED` after the Soroban transaction confirms (not before)
- [ ] If the Soroban call fails, the local status remains `PASSED` and the error is propagated so the caller can retry
- [ ] A migration is provided if `Proposal` requires a new `onChainProposalId` column
- [ ] Unit tests cover: concurrent double-vote (race), sequential double-vote (non-race), quorum threshold crossing, timelock not-yet-elapsed rejection, and Soroban execution failure leaving status as `PASSED`

---

### Relevant files / functions

| File | Notes |
|---|---|
| `src/modules/governance/governance.service.ts:112–167` | `vote()` race + `executeProposal()` stub — main targets |
| `src/modules/governance/entities/proposal-vote.entity.ts` | Needs unique constraint on `(proposal_id, voter_wallet)` |
| `src/modules/governance/entities/proposal.entity.ts` | May need `onChainProposalId` field |
| `src/modules/governance/governance.module.ts` | Needs `StellarModule` import |
| `src/modules/stellar/stellar.service.ts:195–202` | `execute()` — the target call |
| `src/migrations/006_governance_enhancements.sql` | Reference for existing schema; new migration goes alongside |

---

### Out of scope

- Do not change the quorum calculation model (votes-for > votes-against)
- Do not add weighted voting or token-based voting power (v1.0 scope)
- Do not implement proposal creation on-chain (only `execute` needs Soroban wiring here)
- Do not change the timelock duration configuration

---

### Self-check

> If solved, this issue moves the v0.2 _"live Soroban testnet integration end-to-end"_ and the pre-v1.0 _"security audit"_ goals forward because governance currently accepts fraudulent votes and executes proposals that have no on-chain effect — both of which would fail an audit immediately.
