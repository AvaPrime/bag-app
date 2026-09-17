export type CapabilityTier = "R0" | "R1" | "A1" | "A2" | "A3" | "D1" | "D2";

export type ExecutionState =
  | "PROPOSED"
  | "POLICY_EVALUATED"
  | "AUTHORIZED"
  | "DISPATCHED"
  | "OBSERVED"
  | "VERIFIED"
  | "REJECTED"
  | "FAILED"
  | "INVALIDATED";

export type EvidenceVerdict = "VALID" | "INVALID" | "UNVERIFIABLE";

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetSnapshot {
  tagName: string;
  id: string;
  domHash: string;
  geometry: Geometry;
}

export interface ExecutionLease {
  leaseId: string;
  authorizationId: string;
  agentId: string;
  tabId: number;
  frameId: number;
  targetIndex: number;
  targetSnapshot: TargetSnapshot;
  tier: CapabilityTier;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  alg: "Ed25519";
  kid: string;
  policyId: string;
  policyHash: string;
  signature: string;
  publicKey?: string;
}

export interface PolicyGrant {
  policyId: string;
  principalId: string;
  allowedTiers: CapabilityTier[];
  allowedDomains: string[];
  maxLeaseTtlMs: number;
  requiresHumanApprovalFor: string[];
}

export interface GatewayIdentity {
  kid: string;
  fingerprint: string;
  publicPem: string;
  privatePkcs8: Uint8Array;
  publicSpki: Uint8Array;
  ephemeral: boolean;
}

export interface EvidenceRecord {
  evidenceId: string;
  timestamp: string;
  intent: {
    agentId: string;
    tool: string;
    params: Record<string, unknown>;
    intentHash: string;
  };
  authority: {
    tier: CapabilityTier;
    policyEvaluation: "PERMITTED" | "DENIED";
    authorizationId: string;
    leaseId: string;
    leaseTtlMs: number;
    kid: string;
  };
  execution: {
    tabId: number;
    targetIndex: number;
    dispatched: boolean;
    state: ExecutionState;
    targetSnapshot: TargetSnapshot;
    refusalReason?: string;
  };
  effect: {
    nativeEventsDispatched: string[];
    domMutationsObserved: number;
  };
  verification: {
    status: "VERIFIED" | "FAILED" | "INVALIDATED" | "REFUSED";
    postConditionsSatisfied: string[];
    unsatisfied: string[];
  };
  signature: {
    alg: "Ed25519" | "HMAC-SHA256";
    kid?: string;
    value: string;
    publicKey?: string;
  };
}

export interface VerifyResult {
  verdict: EvidenceVerdict;
  reason: string;
  checked: boolean;
}

export interface LeaseVerifyResult {
  valid: boolean;
  reason?: string;
}

export interface ProbeResult {
  id: string;
  finding: string;
  attack: string;
  detected: string;
  refused: boolean;
  detail: string;
}

export interface KernelLog {
  id: string;
  at: number;
  level: "info" | "ok" | "deny" | "warn";
  state?: ExecutionState;
  message: string;
  code?: string;
}

export const MUTATING_TIERS: CapabilityTier[] = ["A1", "A2", "A3"];

export const ENTERPRISE_POLICY: PolicyGrant = {
  policyId: "enterprise-treasury-v0.1",
  principalId: "claude-enterprise-agent",
  allowedTiers: ["R0", "R1", "A1", "A2"],
  allowedDomains: ["*.internal.acmebank.com", "treasury.internal.acmebank.com"],
  maxLeaseTtlMs: 30_000,
  requiresHumanApprovalFor: ["confirm_critical_action", "A3:*"],
};
