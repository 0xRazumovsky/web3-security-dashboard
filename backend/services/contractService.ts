import { Types } from "mongoose";
import { getAddress } from "ethers";
import ContractModel, { ContractDocument } from "../models/contract";
import { RiskLevel } from "../types/analysis";
import HttpError from "../utils/httpError";

export const normalizeAddress = (address: string): string => {
  if (!address) {
    throw new Error("Address is required");
  }
  try {
    return getAddress(address.trim()).toLowerCase();
  } catch (error) {
    throw new HttpError(400, "Invalid Ethereum address", {
      address,
      error: error instanceof Error ? error.message : error,
    });
  }
};

interface EnsureContractInput {
  address: string;
  network?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export const ensureContract = async ({
  address,
  network = "mainnet",
  labels = [],
  metadata = {},
}: EnsureContractInput): Promise<ContractDocument> => {
  const normalizedAddress = normalizeAddress(address);

  const updatePayload: Record<string, unknown> & {
    [key: string]: unknown;
  } = {
    $setOnInsert: {
      address: normalizedAddress,
      network,
    },
  };

  if (labels.length > 0) {
    updatePayload.$addToSet = { labels: { $each: labels } };
  }

  if (metadata && Object.keys(metadata).length > 0) {
    updatePayload.$set = {
      ...(updatePayload.$set as Record<string, unknown>),
      metadata,
    };
  }

  const contract = await ContractModel.findOneAndUpdate(
    { address: normalizedAddress, network },
    updatePayload,
    { new: true, upsert: true }
  ).exec();

  return contract;
};

export const getContractByAddress = async (
  address: string,
  network?: string
): Promise<ContractDocument | null> => {
  const normalizedAddress = normalizeAddress(address);
  const networkName = network ?? "mainnet";
  return ContractModel.findOne({
    address: normalizedAddress,
    network: networkName,
  })
    .populate("latestScan")
    .exec();
};

export const listContracts = async ({
  riskLevel,
  network,
  limit = 20,
  skip = 0,
}: {
  riskLevel?: RiskLevel;
  network?: string;
  limit?: number;
  skip?: number;
}): Promise<ContractDocument[]> => {
  const query: Record<string, unknown> = {};
  if (riskLevel) {
    query.riskLevel = riskLevel;
  }
  if (network) {
    query.network = network;
  }

  return ContractModel.find(query)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(Math.min(limit, 100))
    .populate("latestScan")
    .exec();
};

export const updateContractRisk = async (
  contractId: Types.ObjectId,
  {
    riskScore,
    riskLevel,
    latestScan,
  }: { riskScore: number; riskLevel: RiskLevel; latestScan: Types.ObjectId }
): Promise<void> => {
  await ContractModel.findByIdAndUpdate(
    contractId,
    {
      $set: {
        riskScore,
        riskLevel,
        latestScan,
        updatedAt: new Date(),
      },
    },
    { new: true }
  ).exec();
};

export default {
  ensureContract,
  getContractByAddress,
  listContracts,
  updateContractRisk,
};
