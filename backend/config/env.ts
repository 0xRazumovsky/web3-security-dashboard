import dotenv from "dotenv";

dotenv.config();

const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Environment variable ${key} is required`);
  }
  return value;
};

const parseList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  rpcUrl: getEnv("RPC_URL"),
  mongoUri: getEnv("MONGO_URI", "mongodb://localhost:27017/web3-security"),
  redisUrl: getEnv("REDIS_URL", "redis://localhost:6379"),
  kafka: {
    clientId: process.env.KAFKA_CLIENT_ID ?? "kafka",
    brokers: parseList(process.env.KAFKA_BROKERS ?? "kafka:9092") as [
      string,
      ...string[]
    ],
    topic: process.env.KAFKA_TOPIC ?? "contract-scan-requests",
  },
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 600),
};

export default config;
