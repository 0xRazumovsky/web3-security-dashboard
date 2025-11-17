import { Schema, model, Document, Types } from "mongoose";
import { RiskLevel } from "../types/analysis";

export interface ContractDocument extends Document {
  address: string;
  network: string;
  labels: string[];
  metadata?: Record<string, unknown>;
  latestScan?: Types.ObjectId;
  riskScore?: number;
  riskLevel?: RiskLevel;
  createdAt: Date;
  updatedAt: Date;
}

const contractSchema = new Schema<ContractDocument>(
  {
    address: { type: String, required: true, lowercase: true },
    network: { type: String, required: true, default: "mainnet" },
    labels: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    latestScan: { type: Schema.Types.ObjectId, ref: "Scan" },
    riskScore: { type: Number },
    riskLevel: { type: String, enum: ["low", "medium", "high", "critical"] },
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

contractSchema.index({ address: 1, network: 1 }, { unique: true });
contractSchema.index({ riskLevel: 1 });

export const ContractModel = model<ContractDocument>("Contract", contractSchema);

export default ContractModel;
