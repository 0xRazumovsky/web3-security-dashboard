# Building a Bytecode-First Security Dashboard for Web3 (and Why ABI Doesn’t Matter)

An explosion of on-chain experimentation means we need faster, opinionated tooling to judge whether a contract we are about to interact with is even remotely safe. This project started as a personal itch while triaging protocol launches: copy an address, hit a single endpoint, and get enough bytecode intelligence to decide if the contract is worth a deeper manual audit. The result is a full-stack platform that ingests addresses, distributes scan jobs through Kafka, runs static heuristics on raw EVM bytecode, and streams results to a React dashboard in real time.

## Product idea and goals

The north star is _time-to-signal_. Analysts care less about pretty dashboards and more about quickly spotting red flags (delegatecall proxies, selfdestruct paths, privileged owners, etc.). That shaped a few early decisions:

- Treat bytecode as the source of truth—ABI metadata is optional, so heuristics must work even when source code is unavailable.
- Async by default: scans can take seconds, so requests must enqueue jobs instead of blocking users.
- Persistence-first history: every submission lands in MongoDB so we can later correlate risk scores, tag contracts, and compare scans across networks.
- Wallet-aware UI: gating submissions behind a connected wallet keeps a minimal audit trail of who requested what without spinning up full authentication.

## Architecture in practice

```
Vite/React SPA ──▶ Express API ──▶ MongoDB
                    │     │
                    │     └─▶ Redis (bytecode + scan cache)
                    │
                Kafka topic
                    │
                Worker (TS) ──▶ Ethereum RPC
```

- Backend: Express 5 with TypeScript (`backend/app.ts`) exposes `/contracts`, `/scans`, `/dashboard`, and `/chain` routes. Zod guards every payload, and Pino logs requests with latency metadata.
- Queue: Kafka (KafkaJS client) decouples writes from analysis. The API simply writes `ScanJobPayload`s; a dedicated worker (`backend/worker.ts`) consumes them.
- Persistence: MongoDB models (`backend/models/contract.ts`, `backend/models/scan.ts`) track contract metadata, scan findings, opcode summaries, and risk scores. Redis sits beside Mongo to cache bytecode and scan reports with TTL-based eviction.
- Frontend: a Vite SPA (`frontend/client/pages/Index.tsx`) orchestrates wallet connection, scan submissions, polling via `waitForScanCompletion`, and renders historical analyses from `/contracts?limit=50`. (design built with builder.io - i'm a colorblind guy)
- Ops: `docker-compose.yml` spins up Mongo, Redis, Kafka (with Zookeeper), the API, worker, and frontend in one command. `k8s/*.yaml` mirrors the stack for clusters.

Every hop is type-safe. Shared TypeScript types (e.g., `RiskLevel`, `AnalysisReport`) flow from backend logic to the client mapping helpers (`frontend/client/lib/api.ts`) so the UI never guesses shape changes.

## How analysis works

1. **Normalization & deduping** – `createScanRequest` lowercases and checksums addresses (`ethers.getAddress`), ensures a `Contract` document exists, and aborts if a pending scan already targets the same contract. This prevents Kafka spam and Mongo duplicates.
2. **Job dispatch** – The API enqueues `{ scanId, contractId, address, abi? }` to Kafka. Because the worker runs in its own consumer group, it can scale horizontally without double-processing.
3. **Execution context** – The worker fetches the latest block number and balance from an `ethers.JsonRpcProvider`. Bytecode pulls are cached in Redis via `getCachedBytecode` to stay under RPC rate limits.
4. **Bytecode heuristics** – `backend/services/analysis/bytecodeAnalyzer.ts` parses opcodes sequentially, tracks how often “dangerous” instructions (`DELEGATECALL`, `CALLCODE`, `SELFDESTRUCT`, `CREATE2`, etc.) appear, and appends `AnalysisFinding`s with severity-weighted scores. ABI parsing is optional; when present it scans function names for admin/financial verbs to flag privileged entrypoints.
5. **Risk scoring** – Each finding contributes to a weighted score (`critical=10` … `low=1`). Aggregate scores map to qualitative levels via `evaluateRiskLevel()`. The report also hashes bytecode (`keccak256`), records opcode diversity, and tags suspicious patterns (e.g., low opcode density implies padded data segments).
6. **Persistence & caching** – Scan documents capture findings plus metadata (balance, block number, bytecode hash). Results are written back to Mongo, cached in Redis (`cacheScanReport`), and the parent `Contract` is updated with its latest risk level.
7. **Realtime UX** – The frontend polls `/scans/:id` until status flips from `running` to `succeeded/failed`. Because Redis returns cached reports instantly, analysts see results as soon as the worker writes them without hammering Mongo.

The most satisfying part is how little logic the API needs at request time: everything after `POST /contracts` happens asynchronously, yet the UI still behaves as if scans are realtime because the worker writes back within a few seconds.

## Technical issues faced along the way

1. **RPC fan-out and rate limits** – Fetching bytecode, balances, and block numbers for every job quickly hit shared RPC quotas. The fix was a shared Redis cache with a configurable TTL (`CACHE_TTL_SECONDS`) so hot contracts never double-hit the provider during spikes.
2. **Duplicate scans & eventual consistency** – Analysts often paste the same address repeatedly. Before enqueuing a job we query Mongo for any `pending`/`running` scan tied to the contract. If one exists we simply return it, ensuring Kafka stays clean and downstream metrics (like pending counts) stay accurate.
3. **ABI parsing failures** – User-submitted ABIs are frequently malformed. The analyzer wraps `new Interface(abi)` in a try/catch and records an `abi-parse-error` finding so the UI can surface the failure rather than silently dropping ABI context.
4. **Balancing speed vs. accuracy** – Pure opcode heuristics can be noisy. To tame false positives we:
   - Weight opcodes differently in the risk score.
   - Only escalate “high balance with risks” when Redis-provided balances exist.
   - Flag suspicious code padding to highlight obfuscated payloads.
     These guardrails came after testing on production bytecode dumps and iterating when high-profile safe contracts were misclassified.
5. **Local developer ergonomics** – Running Kafka, Mongo, Redis, API, worker, and frontend simultaneously can be painful. Shipping a single `docker compose up` and mirroring that configuration across `k8s/*.yaml` massively lowered setup friction and made it trivial to demo the platform on new machines.

## What I would add next

1. **AI-powered search** - ML-model to improve vulnerability detection, or an AI-model to generate higher-level summaries and propose actionable steps.
2. **Deeper analysis engines** – Pipe bytecode through Slither, Mythril, or a custom symbolic executor. Kafka makes it easy to append new workers that enrich the same scan document with fuzzing traces or invariants.
3. **Chain coverage & RPC fallback** – Support multi-chain RPC pools with per-chain Kafka topics, plus fallback providers to survive mainnet outages.
4. **Streaming updates** – Replace the polling loop with Server-Sent Events or WebSockets so the UI receives push notifications the moment a scan completes (and to reduce load on `/scans/:id`).
5. **AuthN/AuthZ** – Wallet signatures or OAuth + role-based access would unlock team dashboards, analyst attribution, and access controls for sensitive reports.
6. **Alerting & reporting** – Webhooks or email digests when contracts cross risk thresholds, plus PDF/CSV exports for compliance teams.
7. **Knowledge graph enrichment** – Join scan results with external registries (Sourcify, 4byte.directory) to surface verified source code, proxy relationships, and previously exploited addresses.
8. **Supporting for non-EVM chains** - e.g. Solana, Sui, L2 ecosystems and other.

## Closing thoughts

Even though the analyzer today is heuristic-driven, the platform’s value comes from the scaffolding: dependable ingestion, caching, persistence, and a UI that makes bytecode insights digestible. Shipping those foundations means we can now plug in richer static or dynamic analysis engines without touching the product experience. If you’re building anything similar—or want to layer your own detectors on top—clone the repo, set your `RPC_URL`, run `docker compose up`, and start firing contract addresses at it. Feedback, feature ideas, or new heuristics are always welcome.

// Добавить про AI-powered, ML, non-evm
