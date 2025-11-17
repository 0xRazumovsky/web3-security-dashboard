import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { getBlockNumber, getContractState } from "./ethService";

const router = Router();

router.get(
  "/block",
  asyncHandler(async (_req, res) => {
    const blockNumber = await getBlockNumber();
    res.json({ blockNumber });
  })
);

router.get(
  "/contracts/:address",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: "Address parameter is required" });
    }
    const state = await getContractState(address);
    res.json(state);
  })
);

export default router;
