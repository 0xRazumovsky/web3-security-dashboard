import { Schema, model, Document, Types } from "mongoose";
import { AnalysisFinding, OpcodeSummary, RiskLevel } from "../types/analysis";

export type ScanStatus = "pending" | "running" | "succeeded" | "failed";

export interface ScanDocument extends Document {
  contract: Types.ObjectId;
  status: ScanStatus;
  riskScore?: number;
  riskLevel?: RiskLevel;
  findings: AnalysisFinding[];
  opcodeSummary?: OpcodeSummary;
  bytecodeHash?: string;
  balanceWei?: string;
  blockNumber?: number;
  error?: string;
  abi?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const findingSchema = new Schema<AnalysisFinding>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    severity: {
      type: String,
      required: true,
      enum: ["low", "medium", "high", "critical"],
    },
    references: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const opcodeSummarySchema = new Schema<OpcodeSummary>(
  {
    totalOpcodes: { type: Number, required: true },
    dangerousOpcodeHits: {
      type: Map,
      of: Number,
      default: {},
    },
    uniqueOpcodes: { type: Number, required: true },
  },
  { _id: false }
);

const scanSchema = new Schema<ScanDocument>(
  {
    contract: {
      type: Schema.Types.ObjectId,
      ref: "Contract",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "running", "succeeded", "failed"],
      default: "pending",
      index: true,
    },
    riskScore: { type: Number },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
    },
    findings: { type: [findingSchema], default: [] },
    opcodeSummary: { type: opcodeSummarySchema },
    bytecodeHash: { type: String, index: true },
    balanceWei: { type: String },
    blockNumber: { type: Number },
    error: { type: String },
    abi: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id;
        Reflect.deleteProperty(ret, "_id");
        Reflect.deleteProperty(ret, "__v");
      },
    },
  }
);

scanSchema.index({ createdAt: -1 });
scanSchema.index({ riskLevel: 1 });

export const ScanModel = model<ScanDocument>("Scan", scanSchema);

export default ScanModel;
