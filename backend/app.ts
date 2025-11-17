import express from "express";
import contractsRoutes from "./routes/contractsRoutes";
import scanRoutes from "./routes/scanRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import chainRoutes from "./routes/chainRoutes";
import errorHandler from "./middleware/errorHandler";
import logger from "./utils/logger";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startedAt;
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
      },
      "request.completed"
    );
  });
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/contracts", contractsRoutes);
app.use("/scans", scanRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/chain", chainRoutes);

app.use((_req, res, _next) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

export default app;
