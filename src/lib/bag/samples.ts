import type { EvidenceRecord } from "./types";

/** Bundled HMAC-era sample. Structure is plausible; it was never actually verified. */
export const HMAC_ERA_EVIDENCE: EvidenceRecord = {
  evidenceId: "ev_54e1e171c0a1",
  timestamp: "2026-09-15T22:04:11.204Z",
  intent: {
    agentId: "claude-enterprise-agent",
    tool: "click_element_by_index",
    params: { index: 2 },
    intentHash: "54e1e171c0a1b8d4e90f2aa17c6d4b3f8e1c9a20d5f7b3c4a6e8d0f1a2b3c4d5",
  },
  authority: {
    tier: "A2",
    policyEvaluation: "PERMITTED",
    authorizationId: "authz_deadbeef",
    leaseId: "lease_hmac_era",
    leaseTtlMs: 30000,
    kid: "none",
  },
  execution: {
    tabId: 1,
    targetIndex: 2,
    dispatched: true,
    state: "VERIFIED",
    targetSnapshot: {
      tagName: "button",
      id: "approve-wire",
      domHash: "button:approve-wire:220x44",
      geometry: { x: 48, y: 312, width: 220, height: 44 },
    },
  },
  effect: {
    nativeEventsDispatched: ["pointerdown", "mousedown", "click"],
    domMutationsObserved: 1,
  },
  verification: {
    status: "VERIFIED",
    postConditionsSatisfied: ["TRANSFER_APPROVED"],
    unsatisfied: [],
  },
  signature: {
    alg: "HMAC-SHA256",
    value: "54e1e171c0a1b8d4e90f2aa17c6d4b3f8e1c9a20d5f7b3c4a6e8d0f1a2b3c4d5",
  },
};

export const FORGED_WIRE_CLAIM: EvidenceRecord = {
  evidenceId: "ev_forged_wire",
  timestamp: "2026-09-16T08:11:00.000Z",
  intent: {
    agentId: "attacker",
    tool: "click_element_by_index",
    params: { index: 2, amount: 4_200_000 },
    intentHash: "0000000000000000000000000000000000000000000000000000000000000000",
  },
  authority: {
    tier: "A2",
    policyEvaluation: "PERMITTED",
    authorizationId: "authz_forged",
    leaseId: "lease_forged",
    leaseTtlMs: 30000,
    kid: "rogue-kid",
  },
  execution: {
    tabId: 1,
    targetIndex: 2,
    dispatched: true,
    state: "VERIFIED",
    targetSnapshot: {
      tagName: "button",
      id: "approve-wire",
      domHash: "button:approve-wire:220x44",
      geometry: { x: 48, y: 312, width: 220, height: 44 },
    },
  },
  effect: {
    nativeEventsDispatched: ["click"],
    domMutationsObserved: 1,
  },
  verification: {
    status: "VERIFIED",
    postConditionsSatisfied: ["TRANSFER_APPROVED"],
    unsatisfied: [],
  },
  signature: {
    alg: "Ed25519",
    kid: "rogue-kid",
    value: "ab".repeat(64),
    publicKey: "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----",
  },
};
