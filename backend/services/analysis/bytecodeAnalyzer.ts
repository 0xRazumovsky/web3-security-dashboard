import { Interface, InterfaceAbi, keccak256, FunctionFragment } from "ethers";
import { AnalysisFinding, AnalysisReport, RiskLevel } from "../../types/analysis";

const opcodeMetadata = {
  f0: {
    name: "CREATE",
    severity: "medium" as RiskLevel,
    title: "Contract deploys other contracts",
    description:
      "CREATE opcode detected. Factories and proxies often use CREATE. Review deployment logic for controlled usage.",
  },
  f1: {
    name: "CALL",
    severity: "medium" as RiskLevel,
    title: "External call detected",
    description:
      "CALL opcode can forward arbitrary gas and value. Ensure called addresses are trusted or validated.",
  },
  f2: {
    name: "CALLCODE",
    severity: "critical" as RiskLevel,
    title: "Legacy CALLCODE usage",
    description:
      "CALLCODE shares context with callee similar to DELEGATECALL and is widely considered unsafe.",
  },
  f4: {
    name: "DELEGATECALL",
    severity: "high" as RiskLevel,
    title: "Delegatecall usage",
    description:
      "DELEGATECALL executes external code in the caller context. Ensure delegate target and storage layout are controlled.",
  },
  f5: {
    name: "CREATE2",
    severity: "medium" as RiskLevel,
    title: "Deterministic deployments",
    description:
      "CREATE2 opcode detected. Verify salts and initialization logic to avoid collision or misuse.",
  },
  fa: {
    name: "STATICCALL",
    severity: "low" as RiskLevel,
    title: "Static call usage",
    description:
      "STATICCALL is read-only but may indicate reliance on external contracts. Confirm upstream contract assumptions.",
  },
  ff: {
    name: "SELFDESTRUCT",
    severity: "high" as RiskLevel,
    title: "Self-destruct capability",
    description:
      "SELFDESTRUCT enables the contract to wipe code and force-send funds. Ensure destruction is properly restricted.",
  },
  "3f": {
    name: "EXTCODESIZE",
    severity: "low" as RiskLevel,
    title: "Contract existence checks",
    description:
      "EXTCODESIZE is often used to detect contracts. Ensure protections against flash-loan or phishing bypasses.",
  },
  "32": {
    name: "ORIGIN",
    severity: "high" as RiskLevel,
    title: "tx.origin authentication",
    description:
      "ORIGIN opcode suggests reliance on tx.origin. This pattern is dangerous for authentication flows.",
  },
  "55": {
    name: "SSTORE",
    severity: "low" as RiskLevel,
    title: "Storage mutation",
    description:
      "SSTORE indicates mutable state. Combined with admin-like functions this could enable privileged behavior.",
  },
} satisfies Record<
  string,
  { name: string; severity: RiskLevel; title: string; description: string }
>;

const severityWeight: Record<RiskLevel, number> = {
  low: 1,
  medium: 3,
  high: 6,
  critical: 10,
};

const adminKeywords = [
  "owner",
  "admin",
  "setadmin",
  "setowner",
  "pause",
  "unpause",
  "upgrade",
  "transferownership",
];

const financialKeywords = [
  "withdraw",
  "deposit",
  "transfer",
  "mint",
  "burn",
  "sweep",
  "claim",
];

const normalizeBytecode = (bytecode: string): string => {
  if (!bytecode) {
    return "0x";
  }
  return bytecode.startsWith("0x") ? bytecode.toLowerCase() : `0x${bytecode.toLowerCase()}`;
};

const isPushOpcode = (opcode: number): boolean => opcode >= 0x60 && opcode <= 0x7f;

interface AnalyzeOptions {
  address: string;
  bytecode: string;
  balanceWei?: string;
  blockNumber?: number;
  abi?: InterfaceAbi;
}

const evaluateRiskLevel = (score: number): RiskLevel => {
  if (score >= 18) return "critical";
  if (score >= 12) return "high";
  if (score >= 6) return "medium";
  return "low";
};

const appendFinding = (
  findings: AnalysisFinding[],
  metadataKey: string,
  occurrences: number
) => {
  const entry = opcodeMetadata[metadataKey as keyof typeof opcodeMetadata];
  if (!entry) return;

  findings.push({
    id: `${entry.name.toLowerCase()}-usage`,
    title: entry.title,
    description: `${entry.description} Observed ${occurrences} time(s).`,
    severity: entry.severity,
    metadata: {
      occurrences,
    },
  });
};

const analyzeAbi = (
  abi: InterfaceAbi | undefined
): Pick<AnalysisFinding, "id" | "title" | "description" | "severity" | "metadata">[] => {
  if (!abi) {
    return [];
  }

  let iface: Interface;
  try {
    iface = new Interface(abi);
  } catch (err) {
    return [
      {
        id: "abi-parse-error",
        title: "ABI parsing failed",
        description: `Provided ABI could not be parsed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        severity: "medium",
        metadata: { rawError: err instanceof Error ? err.stack : err },
      },
    ];
  }

  const functionFragments = iface.fragments.filter(
    (fragment): fragment is FunctionFragment => fragment.type === "function"
  );

  const findings: AnalysisFinding[] = [];

  let adminFunctionCount = 0;
  let financialFunctionCount = 0;

  for (const fragment of functionFragments) {
    const fn = fragment.name?.toLowerCase();
    if (!fn) {
      continue;
    }
    if (adminKeywords.some((keyword) => fn.includes(keyword))) {
      adminFunctionCount += 1;
    }
    if (financialKeywords.some((keyword) => fn.includes(keyword))) {
      financialFunctionCount += 1;
    }
  }

  if (adminFunctionCount > 0) {
    findings.push({
      id: "admin-function-detected",
      title: "Administrative functions exposed",
      description: `Detected ${adminFunctionCount} function(s) that match common administrative patterns.`,
      severity: adminFunctionCount > 2 ? "high" : "medium",
      metadata: { count: adminFunctionCount },
    });
  }

  if (financialFunctionCount > 0) {
    findings.push({
      id: "financial-function-detected",
      title: "Financial control functions exposed",
      description: `Detected ${financialFunctionCount} function(s) with financial authority patterns.`,
      severity: "medium",
      metadata: { count: financialFunctionCount },
    });
  }

  return findings;
};

export const analyzeBytecode = ({
  address,
  bytecode,
  balanceWei,
  blockNumber,
  abi,
}: AnalyzeOptions): AnalysisReport => {
  const normalizedBytecode = normalizeBytecode(bytecode);
  const hex = normalizedBytecode.slice(2);

  if (hex.length === 0) {
    return {
      address,
      riskScore: 0,
      riskLevel: "low",
      findings: [
        {
          id: "empty-bytecode",
          title: "Externally Owned Account",
          description:
            "No bytecode found at this address. It is likely an externally owned account (EOA).",
          severity: "low",
        },
      ],
      opcodeSummary: {
        totalOpcodes: 0,
        dangerousOpcodeHits: {},
        uniqueOpcodes: 0,
      },
      bytecodeHash: "0x0",
      ...(balanceWei !== undefined ? { balanceWei } : {}),
      ...(blockNumber !== undefined ? { blockNumber } : {}),
    };
  }

  const uniqueOpcodes = new Set<string>();
  const dangerousOpcodeHits: Record<string, number> = {};
  let totalOpcodes = 0;

  for (let i = 0; i < hex.length; ) {
    const opcodeHex = hex.slice(i, i + 2);
    i += 2;
    totalOpcodes += 1;

    uniqueOpcodes.add(opcodeHex);

    const opcodeValue = parseInt(opcodeHex, 16);
    if (isPushOpcode(opcodeValue)) {
      const pushLength = opcodeValue - 0x5f;
      i += pushLength * 2;
    }

    if (opcodeMetadata[opcodeHex as keyof typeof opcodeMetadata]) {
      const entry = opcodeMetadata[opcodeHex as keyof typeof opcodeMetadata];
      dangerousOpcodeHits[entry.name] = (dangerousOpcodeHits[entry.name] ?? 0) + 1;
    }
  }

  const findings: AnalysisFinding[] = [];

  for (const [opcodeHex, entry] of Object.entries(opcodeMetadata)) {
    const opcodeName = entry.name;
    const occurrences = dangerousOpcodeHits[opcodeName];
    if (occurrences) {
      appendFinding(findings, opcodeHex, occurrences);
    }
  }

  findings.push(...analyzeAbi(abi));

  if (balanceWei && findings.some((finding) => finding.severity === "high" || finding.severity === "critical")) {
    findings.push({
      id: "high-balance-with-risks",
      title: "Balance guarded by risky patterns",
      description:
        "This contract holds funds and exposes high severity opcodes. Confirm access controls and upgrade paths.",
      severity: "high",
      metadata: { balanceWei },
    });
  }

  if (totalOpcodes / (hex.length / 2 || 1) < 0.25) {
    findings.push({
      id: "suspicious-padding",
      title: "Large segments of bytecode data",
      description:
        "Significant portions of the bytecode are data segments rather than logic opcodes. Review for embedded payloads or obfuscation.",
      severity: "medium",
    });
  }

  const totalRiskScore = findings.reduce(
    (acc, finding) => acc + severityWeight[finding.severity],
    0
  );

  const riskLevel = evaluateRiskLevel(totalRiskScore);

  const report: AnalysisReport = {
    address,
    riskScore: totalRiskScore,
    riskLevel,
    findings,
    opcodeSummary: {
      totalOpcodes,
      dangerousOpcodeHits,
      uniqueOpcodes: uniqueOpcodes.size,
    },
    bytecodeHash: keccak256(normalizedBytecode),
    ...(balanceWei !== undefined ? { balanceWei } : {}),
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  };

  return report;
};

export default analyzeBytecode;
