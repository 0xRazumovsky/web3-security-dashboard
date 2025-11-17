import type { InterfaceAbi } from "ethers";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface AnalysisFinding {
  id: string;
  title: string;
  description: string;
  severity: RiskLevel;
  references?: string[];
  metadata?: Record<string, unknown>;
}

export interface OpcodeSummary {
  totalOpcodes: number;
  dangerousOpcodeHits: Record<string, number>;
  uniqueOpcodes: number;
}

export interface AnalysisReport {
  address: string;
  riskScore: number;
  riskLevel: RiskLevel;
  findings: AnalysisFinding[];
  opcodeSummary: OpcodeSummary;
  bytecodeHash: string;
  balanceWei?: string;
  blockNumber?: number;
}

export interface ScanJobPayload {
  scanId: string;
  contractId: string;
  address: string;
  network?: string;
  abi?: InterfaceAbi;
}
