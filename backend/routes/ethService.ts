import { formatEther } from "ethers";
import { normalizeAddress } from "../services/contractService";
import { getCachedBytecode, setCachedBytecode } from "../services/cacheService";
import getProvider from "../utils/provider";

const provider = getProvider();

export const getBlockNumber = async (): Promise<number> => {
  return provider.getBlockNumber();
};

export const getContractState = async (address: string) => {
  const checksum = normalizeAddress(address);

  const [blockNumber, balance, txCount] = await Promise.all([
    provider.getBlockNumber(),
    provider.getBalance(checksum),
    provider.getTransactionCount(checksum),
  ]);

  let bytecode = await getCachedBytecode(checksum);
  if (!bytecode) {
    bytecode = await provider.getCode(checksum);
    await setCachedBytecode(checksum, bytecode);
  }

  return {
    address: checksum,
    balance: formatEther(balance),
    balanceWei: balance.toString(),
    bytecode,
    transactionCount: txCount,
    blockNumber,
  };
};

export default {
  getBlockNumber,
  getContractState,
};
