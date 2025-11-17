import { Router } from "express";
import { z } from "zod";
import asyncHandler from "../utils/asyncHandler";
import { getScanById, listScans } from "../services/scanService";

const router = Router();

const statusSchema = z.enum(["pending", "running", "succeeded", "failed"]).optional();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const querySchema = z.object({
      status: statusSchema,
      limit: z
        .string()
        .transform((value) => parseInt(value, 10))
        .optional(),
      skip: z
        .string()
        .transform((value) => parseInt(value, 10))
        .optional(),
    });

    const { status, limit, skip } = querySchema.parse(req.query);

    const options: Parameters<typeof listScans>[0] = {
      limit: limit ?? 20,
      skip: skip ?? 0,
    };

    if (status) {
      options.status = status;
    }

    const scans = await listScans(options);
    res.json({ data: scans });
  })
);

router.get(
  "/:scanId",
  asyncHandler(async (req, res) => {
    const { scanId } = req.params;
    if (!scanId) {
      return res.status(400).json({ error: "Scan ID is required" });
    }
    const scan = await getScanById(scanId);
    if (!scan) {
      return res.status(404).json({ error: "Scan not found" });
    }
    res.json(scan);
  })
);

export default router;
