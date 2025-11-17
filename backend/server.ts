import app from "./app";
import config from "./config/env";
import connectMongo, { disconnectMongo } from "./database/mongoClient";
import getRedisClient, { closeRedisClient } from "./cache/redisClient";
import { disconnectKafka, getKafkaProducer } from "./queue/kafka";
import logger from "./utils/logger";

const startServer = async (): Promise<void> => {
  try {
    await connectMongo();
    getRedisClient();
    await getKafkaProducer();

    app.listen(config.port, () => {
      logger.info({ port: config.port }, "API listening");
    });
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap application");
    process.exit(1);
  }
};

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info({ signal }, "Shutting down gracefully");
  await Promise.allSettled([disconnectMongo(), closeRedisClient(), disconnectKafka()]);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void startServer();
