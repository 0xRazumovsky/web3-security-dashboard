import { Kafka, Producer, Consumer } from "kafkajs";
import config from "../config/env";
import logger from "../utils/logger";

let kafkaInstance: Kafka | null = null;
let producerInstance: Producer | null = null;

export const getKafka = (): Kafka => {
  if (!kafkaInstance) {
    kafkaInstance = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      retry: {
        retries: 5,
      },
    });
  }
  return kafkaInstance;
};

export const getKafkaProducer = async (): Promise<Producer> => {
  if (producerInstance) {
    return producerInstance;
  }

  producerInstance = getKafka().producer();
  await producerInstance.connect();
  logger.info("Kafka producer connected");
  return producerInstance;
};

export const createKafkaConsumer = async (
  groupId: string
): Promise<Consumer> => {
  const consumer = getKafka().consumer({ groupId });
  await consumer.connect();
  logger.info({ groupId }, "Kafka consumer connected");
  return consumer;
};

export const disconnectKafka = async (): Promise<void> => {
  if (producerInstance) {
    await producerInstance.disconnect();
    producerInstance = null;
    logger.info("Kafka producer disconnected");
  }
};

export default getKafka;
