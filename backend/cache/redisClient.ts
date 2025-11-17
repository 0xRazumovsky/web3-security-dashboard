import Redis from "ioredis";
import config from "../config/env";
import logger from "../utils/logger";

let client: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (client) {
    return client;
  }

  client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });

  client.on("error", (err) => {
    logger.warn(err, "Redis connection error");
  });

  client
    .connect()
    .then(() => logger.info({ url: config.redisUrl }, "Connected to Redis"))
    .catch((err) => logger.error(err, "Failed to connect to Redis"));

  return client;
};

export const closeRedisClient = async (): Promise<void> => {
  if (client) {
    await client.quit();
    client = null;
    logger.info("Redis connection closed");
  }
};

export default getRedisClient;
