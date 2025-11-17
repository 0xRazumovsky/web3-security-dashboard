import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { getDashboardStats } from "../services/scanService";

const router = Router();

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const stats = await getDashboardStats();
    res.json(stats);
  })
);

export default router;
