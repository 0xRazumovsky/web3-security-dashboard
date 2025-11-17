import pino, { type LoggerOptions } from "pino";
import config from "../config/env";

const level = process.env.LOG_LEVEL ?? (config.nodeEnv === "production" ? "info" : "debug");

const options: LoggerOptions = { level };

if (config.nodeEnv !== "production") {
  options.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
    },
  };
}

export const logger = pino(options);

export default logger;
