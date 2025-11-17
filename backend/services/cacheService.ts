import getRedisClient from "../cache/redisClient";
import config from "../config/env";

const redis = getRedisClient();

const codeKey = (address: string) => `contract:${address}:bytecode`;
const scanKey = (scanId: string) => `scan:${scanId}:report`;

export const getCachedBytecode = async (address: string): Promise<string | null> => {
  return redis.get(codeKey(address));
};

export const setCachedBytecode = async (
  address: string,
  bytecode: string
): Promise<void> => {
  if (!bytecode) return;
  await redis.set(codeKey(address), bytecode, "EX", config.cacheTtlSeconds);
};

export const cacheScanReport = async (
  scanId: string,
  report: unknown
): Promise<void> => {
  await redis.set(scanKey(scanId), JSON.stringify(report), "EX", config.cacheTtlSeconds);
};

export const getCachedScanReport = async <T>(scanId: string): Promise<T | null> => {
  const cached = await redis.get(scanKey(scanId));
  return cached ? (JSON.parse(cached) as T) : null;
};
