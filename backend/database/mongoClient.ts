import mongoose from "mongoose";
import config from "../config/env";
import logger from "../utils/logger";

let connectionPromise: Promise<typeof mongoose> | null = null;

export const connectMongo = async (): Promise<typeof mongoose> => {
  if (connectionPromise) {
    return connectionPromise;
  }

  mongoose.set("strictQuery", true);

  connectionPromise = mongoose
    .connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10_000,
    })
    .then((instance) => {
      logger.info({ uri: config.mongoUri }, "Connected to MongoDB");
      return instance;
    })
    .catch((error) => {
      connectionPromise = null;
      logger.error(error, "Failed to connect to MongoDB");
      throw error;
    });

  return connectionPromise;
};

export const disconnectMongo = async (): Promise<void> => {
  if (!connectionPromise) return;
  await mongoose.disconnect();
  connectionPromise = null;
  logger.info("Disconnected from MongoDB");
};

export default connectMongo;
