# Web3 Security Dashboard

TypeScript/Express backend that analyzes smart contract bytecode, highlights opcode-driven risks, and exposes a security dashboard backed by MongoDB, Redis, and Kafka. A worker service consumes scan jobs to perform asynchronous analysis, making it easy to queue and monitor large batches of smart contracts.

## Highlights

- **Opcode heuristics**: Detects high-risk instructions (`DELEGATECALL`, `SELFDESTRUCT`, `CALLCODE`, etc.), ABI-admin patterns, and summarizes opcode usage.
- **Persistence & caching**: Stores contracts and scans in MongoDB, caches bytecode/results in Redis, and exposes aggregated dashboard metrics.
- **Async pipeline**: REST API enqueues scan jobs on Kafka, worker consumes and persists reports.
- **Cloud ready**: Dockerfile, Compose stack (Mongo, Redis, Kafka, API, worker), and Kubernetes manifests for a full cluster deployment.
- **Type-safe**: Endpoints validated with Zod; services instrumented with Pino logging and graceful shutdowns.

## Architecture Overview

```
┌────────┐     ┌────────────┐     ┌──────────┐
│ Client │────▶│ Express API │────▶│ MongoDB  │
└────────┘     └────┬───────┘     └──────────┘
                     │   ▲
        Kafka Topic  │   │ Latest scan + metadata
                     ▼   │
                ┌─────────────┐
                │ Worker (TS) │
                └────┬────────┘
                     │ Fetch bytecode + balance
                     ▼
                 Ethereum RPC

Redis caches bytecode + scan reports for quick lookups.
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and update at least `RPC_URL` (Infura/Alchemy/etc.).

```bash
cp .env.example .env
```

### 3. Run services locally

```bash
# Terminal 1 - API
npm run dev

# Terminal 2 - Worker
npm run worker
```

The API exposes `http://localhost:3000`. The worker must run alongside the API to process Kafka jobs.

> **Note**: MongoDB, Redis, and Kafka must be available. For local development use the Compose stack below.

## Docker Compose Stack

The repository includes a full development stack with MongoDB, Redis, Kafka, the API, and the worker.

```bash
docker compose up --build
```

The API will be available at `http://localhost:3000`. Override `RPC_URL` by exporting the variable before running compose.

## Kubernetes Deployment

Kubernetes manifests live in `k8s/`. Build and load the application image (`web3-security:latest`) into your cluster (kind, k3d, etc.). Then apply the manifests:

```bash
kubectl apply -f k8s/configmap.yaml \
  -f k8s/mongo-statefulset.yaml \
  -f k8s/redis-deployment.yaml \
  -f k8s/kafka-statefulset.yaml \
  -f k8s/api-deployment.yaml \
  -f k8s/api-service.yaml \
  -f k8s/worker-deployment.yaml
```

Adjust `RPC_URL` and broker URIs in `k8s/configmap.yaml` for your environment. For production, replace the single-node Kafka/DB resources with managed services or Helm charts.

## API Endpoints

- `GET /health` – Service status.
- `GET /contracts` – List contracts with optional `riskLevel`/`network` filters.
- `POST /contracts` – Register a contract (optionally enqueue an immediate scan).
- `GET /contracts/:address` – Fetch contract details and latest scan.
- `GET /contracts/:address/scans` – Full scan history for a contract.
- `POST /contracts/:address/scan` – Enqueue a new scan job (accepts optional ABI).
- `GET /scans` – Paginated scans (`status` filter supported).
- `GET /scans/:scanId` – Retrieve a specific scan report.
- `GET /dashboard/stats` – Aggregated metrics (totals, distribution, averages).
- `GET /chain/block` – Current block number from the configured RPC.
- `GET /chain/contracts/:address` – Live on-chain balance + bytecode snapshot.

Refer to `src/routes` for request/response schema details.

## Development Notes

- Kafka topic name defaults to `contract-scan-requests`. Update through env if required.
- Bytecode analysis heuristics live in `src/services/analysis/bytecodeAnalyzer.ts` – extend this file to add additional detections.
- Redis caches opcode results for faster subsequent fetches; adjust `CACHE_TTL_SECONDS` if you need different caching behavior.
- Graceful shutdown hooks ensure Mongo, Redis, and Kafka connections close cleanly.

## Next Steps & Ideas

1. Extend opcode heuristics with formal verification or symbolic execution results.
2. Add a frontend dashboard (Next.js/Svelte) that consumes the REST API.
3. Emit metrics to Prometheus/Grafana for ongoing observability.
4. Integrate signature lookups (4byte.directory) to enrich function selector analysis when ABI is missing.
