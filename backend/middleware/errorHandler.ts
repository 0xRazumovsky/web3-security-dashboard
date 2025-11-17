import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import logger from "../utils/logger";
import { isHttpError } from "../utils/httpError";

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: "ValidationError",
      details: err.flatten(),
    });
  }

  if (isHttpError(err)) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  logger.error(
    {
      path: req.path,
      method: req.method,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
    "Unhandled error"
  );

  res.status(500).json({ error: "Internal server error" });
};

export default errorHandler;
