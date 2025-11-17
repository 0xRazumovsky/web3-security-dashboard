import config from "./config/env";
import connectMongo, { disconnectMongo } from "./database/mongoClient";
import getRedisClient, { closeRedisClient } from "./cache/redisClient";
import { createKafkaConsumer, disconnectKafka } from "./queue/kafka";
import { processScanJob } from "./services/scanService";
import logger from "./utils/logger";
import { ScanJobPayload } from "./types/analysis";

const startWorker = async (): Promise<void> => {
  await connectMongo();
  getRedisClient();

  const consumer = await createKafkaConsumer(`${config.kafka.clientId}-worker`);
  await consumer.subscribe({ topic: config.kafka.topic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        logger.warn("Received message without value");
        return;
      }
      try {
        const payload = JSON.parse(message.value.toString()) as ScanJobPayload;
        await processScanJob(payload);
      } catch (err) {
        logger.error({ err, message: message.value.toString() }, "Failed to process scan job");
      }
    },
  });

  logger.info("Worker ready to process scan jobs");
};

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info({ signal }, "Worker shutting down");
  await Promise.allSettled([disconnectMongo(), closeRedisClient(), disconnectKafka()]);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startWorker().catch((err) => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
