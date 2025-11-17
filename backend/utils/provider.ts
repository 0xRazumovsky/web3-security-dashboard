import { JsonRpcProvider } from "ethers";
import config from "../config/env";
import logger from "./logger";

let provider: JsonRpcProvider | null = null;

export function getProvider(): JsonRpcProvider {
  if (provider) return provider;
  const url = config.rpcUrl;
  provider = new JsonRpcProvider(url);

  provider
    .getNetwork()
    .then((net) => {
      logger.info(
        { network: net.name ?? net.chainId, chainId: net.chainId },
        "Connected to RPC network"
      );
    })
    .catch((err) =>
      logger.warn(
        { error: err instanceof Error ? err.message : err },
        "Warning: provider failed to detect network"
      )
    );

  return provider;
}

export default getProvider;
