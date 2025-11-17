import { Router } from "express";
import { z } from "zod";
import asyncHandler from "../utils/asyncHandler";
import {
  ensureContract,
  getContractByAddress,
  listContracts,
  normalizeAddress,
} from "../services/contractService";
import { createScanRequest, listScansForContract } from "../services/scanService";

const router = Router();

const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]).optional();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      riskLevel: riskLevelSchema,
      network: z.string().optional(),
      limit: z
        .string()
        .transform((value) => parseInt(value, 10))
        .optional(),
      skip: z
        .string()
        .transform((value) => parseInt(value, 10))
        .optional(),
    });

    const { riskLevel, network, limit, skip } = querySchema.parse(req.query);

    const options: Parameters<typeof listContracts>[0] = {
      limit: limit ?? 20,
      skip: skip ?? 0,
    };

    if (riskLevel) {
      options.riskLevel = riskLevel;
    }

    if (network) {
      options.network = network;
    }

    const contracts = await listContracts(options);
    res.json({ data: contracts });
  })
);

router.get(
  "/:address",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: "Address parameter is required" });
    }
    const querySchema = z.object({
      network: z.string().optional(),
    });

    const { network } = querySchema.parse(req.query);

    const contract = await getContractByAddress(address, network);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    res.json(contract);
  })
);

router.get(
  "/:address/scans",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: "Address parameter is required" });
    }
    const querySchema = z.object({
      network: z.string().optional(),
    });

    const { network } = querySchema.parse(req.query);

    const scans = await listScansForContract(address, network);
    res.json({ data: scans });
  })
);

const createContractSchema = z.object({
  address: z.string().min(1),
  network: z.string().optional(),
  labels: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  abi: z.any().optional(),
  enqueueScan: z.boolean().optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = createContractSchema.parse(req.body);
    const contractInput: Parameters<typeof ensureContract>[0] = {
      address: payload.address,
    };

    if (payload.network) {
      contractInput.network = payload.network;
    }
    if (payload.labels) {
      contractInput.labels = payload.labels;
    }
    if (payload.metadata) {
      contractInput.metadata = payload.metadata;
    }

    const contract = await ensureContract(contractInput);

    let scan = null;
    if (payload.enqueueScan) {
      const scanPayload: Parameters<typeof createScanRequest>[0] = {
        address: payload.address,
      };

      if (payload.network) {
        scanPayload.network = payload.network;
      }
      if (payload.abi) {
        scanPayload.abi = payload.abi;
      }
      if (payload.labels) {
        scanPayload.labels = payload.labels;
      }
      if (payload.metadata) {
        scanPayload.metadata = payload.metadata;
      }

      scan = await createScanRequest(scanPayload);
    }

    res.status(201).json({ contract, scan });
  })
);

const scanRequestSchema = z.object({
  abi: z.any().optional(),
  network: z.string().optional(),
  labels: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

router.post(
  "/:address/scan",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: "Address parameter is required" });
    }
    const payload = scanRequestSchema.parse(req.body ?? {});
    const scanPayload: Parameters<typeof createScanRequest>[0] = {
      address: normalizeAddress(address),
    };

    if (payload.network) {
      scanPayload.network = payload.network;
    }
    if (payload.abi) {
      scanPayload.abi = payload.abi;
    }
    if (payload.labels) {
      scanPayload.labels = payload.labels;
    }
    if (payload.metadata) {
      scanPayload.metadata = payload.metadata;
    }

    const scan = await createScanRequest(scanPayload);

    res.status(202).json({ scanId: scan._id, status: scan.status });
  })
);

export default router;
