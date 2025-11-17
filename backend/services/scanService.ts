import { InterfaceAbi } from "ethers";
import { Types } from "mongoose";
import config from "../config/env";
import analyzeBytecode from "./analysis/bytecodeAnalyzer";
import {
  cacheScanReport,
  getCachedScanReport,
  getCachedBytecode,
  setCachedBytecode,
} from "./cacheService";
import { ensureContract, normalizeAddress, updateContractRisk } from "./contractService";
import ScanModel, { ScanDocument } from "../models/scan";
import { getKafkaProducer } from "../queue/kafka";
import { ScanJobPayload } from "../types/analysis";
import getProvider from "../utils/provider";
import logger from "../utils/logger";
import ContractModel from "../models/contract";
import HttpError from "../utils/httpError";

const provider = getProvider();

export interface CreateScanRequest {
  address: string;
  network?: string;
  abi?: InterfaceAbi;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export type CachedScanResult = {
  status: string;
  completedAt?: string;
} & Record<string, unknown>;

export type ScanResult = ScanDocument | CachedScanResult;

export const createScanRequest = async ({
  address,
  network = "mainnet",
  abi,
  labels,
  metadata,
}: CreateScanRequest): Promise<ScanDocument> => {
  const normalizedAddress = normalizeAddress(address);

  const contractInput: Parameters<typeof ensureContract>[0] = {
    address: normalizedAddress,
    network,
  };

  if (labels) {
    contractInput.labels = labels;
  }

  if (metadata) {
    contractInput.metadata = metadata;
  }

  const contract = await ensureContract(contractInput);

  const existing = await ScanModel.findOne({
    contract: contract._id,
    status: { $in: ["pending", "running"] },
  })
    .sort({ createdAt: -1 })
    .exec();

  if (existing) {
    return existing;
  }

  const contractObjectId = contract._id as Types.ObjectId;

  const scan = await ScanModel.create({
    contract: contractObjectId,
    status: "pending",
    ...(abi ? { abi } : {}),
  });

  const payload: ScanJobPayload = {
    scanId: (scan._id as Types.ObjectId).toString(),
    contractId: contractObjectId.toString(),
    address: normalizedAddress,
    network,
  };

  if (abi) {
    payload.abi = abi;
  }

  const producer = await getKafkaProducer();
  await producer.send({
    topic: config.kafka.topic,
    messages: [
      {
        key: payload.contractId,
        value: JSON.stringify(payload),
      },
    ],
  });

  logger.debug({ address, scanId: payload.scanId }, "Enqueued contract scan");

  return scan;
};

export const getScanById = async (scanId: string): Promise<ScanResult | null> => {
  const cached = await getCachedScanReport<CachedScanResult>(scanId);
  if (cached) {
    return cached;
  }

  return ScanModel.findById(scanId).populate("contract").exec();
};

export const listScans = async ({
  limit = 20,
  skip = 0,
  status,
}: {
  limit?: number;
  skip?: number;
  status?: ScanDocument["status"];
}): Promise<ScanDocument[]> => {
  const query: Record<string, unknown> = {};
  if (status) {
    query.status = status;
  }

  return ScanModel.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Math.min(limit, 100))
    .populate("contract")
    .exec();
};

const updateScanStatus = async (
  scanId: Types.ObjectId,
  status: ScanDocument["status"],
  updates: Partial<ScanDocument> = {}
): Promise<void> => {
  await ScanModel.findByIdAndUpdate(
    scanId,
    {
      $set: { status, ...updates, updatedAt: new Date() },
    },
    { new: true }
  ).exec();
};

export const processScanJob = async ({
  scanId,
  contractId,
  address,
  abi,
}: ScanJobPayload): Promise<void> => {
  const scanObjectId = new Types.ObjectId(scanId);
  await updateScanStatus(scanObjectId, "running");

  try {
    const [blockNumber, balance] = await Promise.all([
      provider.getBlockNumber(),
      provider.getBalance(address),
    ]);

    let bytecode = await getCachedBytecode(address);
    if (!bytecode) {
      bytecode = await provider.getCode(address);
      await setCachedBytecode(address, bytecode);
    }

    const analysisInput: Parameters<typeof analyzeBytecode>[0] = {
      address,
      bytecode,
      balanceWei: balance.toString(),
      blockNumber,
    };

    if (abi) {
      analysisInput.abi = abi;
    }

    const report = analyzeBytecode(analysisInput);

    await updateScanStatus(scanObjectId, "succeeded", {
      riskScore: report.riskScore,
      riskLevel: report.riskLevel,
      findings: report.findings,
      opcodeSummary: report.opcodeSummary,
      bytecodeHash: report.bytecodeHash,
      balanceWei: report.balanceWei,
      blockNumber: report.blockNumber,
    } as Partial<ScanDocument>);

    await cacheScanReport(scanId, {
      ...report,
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });

    await updateContractRisk(new Types.ObjectId(contractId), {
      riskScore: report.riskScore,
      riskLevel: report.riskLevel,
      latestScan: scanObjectId,
    });

    logger.info({ address, scanId }, "Scan completed");
  } catch (error) {
    logger.error({ error, scanId, address }, "Contract scan failed");
    await updateScanStatus(scanObjectId, "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getLatestScanByContract = async (
  contractId: Types.ObjectId
): Promise<ScanDocument | null> => {
  return ScanModel.findOne({ contract: contractId }).sort({ createdAt: -1 }).exec();
};

export const listScansForContract = async (
  address: string,
  network?: string
): Promise<ScanDocument[]> => {
  const normalized = normalizeAddress(address);
  const networkName = network ?? "mainnet";
  const contract = await ContractModel.findOne({ address: normalized, network: networkName }).exec();
  if (!contract) {
    throw new HttpError(404, "Contract not found");
  }

  return ScanModel.find({ contract: contract._id })
    .sort({ createdAt: -1 })
    .exec();
};

export const getDashboardStats = async (): Promise<{
  totalContracts: number;
  highRiskContracts: number;
  pendingScans: number;
  latestScans: ScanDocument[];
  riskDistribution: Record<string, number>;
  averageRiskScore: number | null;
}> => {
  const [
    totalContracts,
    highRiskContracts,
    pendingScans,
    latestScans,
    riskDistributionRaw,
    averageRiskScoreRaw,
  ] = await Promise.all([
    ContractModel.countDocuments({}).exec(),
    ContractModel.countDocuments({ riskLevel: { $in: ["high", "critical"] } }).exec(),
    ScanModel.countDocuments({ status: { $in: ["pending", "running"] } }).exec(),
    ScanModel.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("contract")
      .exec(),
    ContractModel.aggregate([
      { $match: { riskLevel: { $exists: true, $ne: null } } },
      { $group: { _id: "$riskLevel", count: { $sum: 1 } } },
    ]).exec(),
    ScanModel.aggregate([
      { $match: { riskScore: { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$riskScore" } } },
    ]).exec(),
  ]);

  const riskDistribution = riskDistributionRaw.reduce<Record<string, number>>(
    (acc, entry) => {
      if (entry._id) {
        acc[String(entry._id)] = entry.count ?? 0;
      }
      return acc;
    },
    {}
  );

  const averageRiskScore = averageRiskScoreRaw.length > 0 ? averageRiskScoreRaw[0].avg : null;

  return {
    totalContracts,
    highRiskContracts,
    pendingScans,
    latestScans,
    riskDistribution,
    averageRiskScore,
  };
};

export default {
  createScanRequest,
  getScanById,
  listScans,
  processScanJob,
  getDashboardStats,
  listScansForContract,
};
