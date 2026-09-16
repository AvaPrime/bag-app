import {
  checkPreDispatch,
  evaluatePolicy,
  intentHash,
  mintLease,
  signEvidence,
  verifyLease,
} from "./doctrine";
import {
  ENTERPRISE_POLICY,
  type CapabilityTier,
  type EvidenceRecord,
  type ExecutionLease,
  type ExecutionState,
  type Geometry,
  type PolicyGrant,
  type TargetSnapshot,
} from "./types";

export interface LiveTarget {
  index: number;
  snapshot: TargetSnapshot;
  geometry: Geometry;
  domHash: string;
  isOccluded: boolean;
  host: string;
}

export interface DispatchAdapter {
  readTarget: (index: number) => LiveTarget | null;
  dispatchClick: (index: number, lease: ExecutionLease) => { events: string[]; mutations: number };
}

export interface ActionRequest {
  agentId: string;
  tool: string;
  tier: CapabilityTier;
  tabId: number;
  targetIndex: number;
  host: string;
  ttlMs?: number;
  grant?: PolicyGrant;
  postConditions?: { approved?: boolean };
}

export interface ActionResult {
  ok: boolean;
  state: ExecutionState;
  dispatched: boolean;
  lease?: ExecutionLease;
  evidence: EvidenceRecord;
  error?: string;
}

export async function executeAuthorizedAction(
  adapter: DispatchAdapter,
  request: ActionRequest,
): Promise<ActionResult> {
  const grant = request.grant ?? ENTERPRISE_POLICY;
  const live = adapter.readTarget(request.targetIndex);
  const hash = await intentHash(request.tool, { index: request.targetIndex });

  const base = {
    evidenceId: `ev_${hash.slice(0, 12)}`,
    timestamp: new Date().toISOString(),
    intent: {
      agentId: request.agentId,
      tool: request.tool,
      params: { index: request.targetIndex },
      intentHash: hash,
    },
  };

  const deny = async (
    state: ExecutionState,
    reason: string,
    extra?: Partial<EvidenceRecord>,
  ): Promise<ActionResult> => {
    const unsigned: Omit<EvidenceRecord, "signature"> = {
      ...base,
      authority: {
        tier: request.tier,
        policyEvaluation: "DENIED",
        authorizationId: "none",
        leaseId: "none",
        leaseTtlMs: 0,
        kid: "none",
      },
      execution: {
        tabId: request.tabId,
        targetIndex: request.targetIndex,
        dispatched: false,
        state,
        targetSnapshot: live?.snapshot ?? {
          tagName: "unknown",
          id: "unknown",
          domHash: "",
          geometry: { x: 0, y: 0, width: 0, height: 0 },
        },
        refusalReason: reason,
      },
      effect: { nativeEventsDispatched: [], domMutationsObserved: 0 },
      verification: { status: "REFUSED", postConditionsSatisfied: [], unsatisfied: [reason] },
      ...extra,
    };
    const evidence = await signEvidence(unsigned);
    return { ok: false, state, dispatched: false, evidence, error: reason };
  };

  const policy = evaluatePolicy(grant, request.tier, request.host, request.tool);
  if (!policy.permitted) {
    return deny("REJECTED", policy.reason ?? "ERR_POLICY_DENIED");
  }

  if (!live) {
    return deny("REJECTED", "ERR_TARGET_NOT_GROUNDED: index is not in the current manifest");
  }

  const lease = await mintLease({
    agentId: request.agentId,
    tabId: request.tabId,
    frameId: 0,
    targetIndex: request.targetIndex,
    snapshot: live.snapshot,
    tier: request.tier,
    ttlMs: request.ttlMs,
    grant,
  });

  const auth = await verifyLease(lease, { tabId: request.tabId, targetIndex: request.targetIndex }, { consumeNonce: true });
  if (!auth.valid) {
    return deny("INVALIDATED", auth.reason ?? "ERR_LEASE_SIGNATURE_INVALID");
  }

  const liveNow = adapter.readTarget(request.targetIndex);
  if (!liveNow) {
    return deny("INVALIDATED", "ERR_TARGET_NOT_GROUNDED: target disappeared before dispatch");
  }

  const pre = checkPreDispatch(lease.targetSnapshot, liveNow);
  if (!pre.ok) {
    const unsigned: Omit<EvidenceRecord, "signature"> = {
      ...base,
      authority: {
        tier: request.tier,
        policyEvaluation: "PERMITTED",
        authorizationId: lease.authorizationId,
        leaseId: lease.leaseId,
        leaseTtlMs: lease.expiresAt - lease.issuedAt,
        kid: lease.kid,
      },
      execution: {
        tabId: request.tabId,
        targetIndex: request.targetIndex,
        dispatched: false,
        state: "INVALIDATED",
        targetSnapshot: liveNow.snapshot,
        refusalReason: pre.reason,
      },
      effect: { nativeEventsDispatched: [], domMutationsObserved: 0 },
      verification: { status: "INVALIDATED", postConditionsSatisfied: [], unsatisfied: [pre.reason] },
    };
    return {
      ok: false,
      state: "INVALIDATED",
      dispatched: false,
      lease,
      evidence: await signEvidence(unsigned),
      error: pre.reason,
    };
  }

  const effect = adapter.dispatchClick(request.targetIndex, lease);
  const after = adapter.readTarget(request.targetIndex) as (LiveTarget & { approved?: boolean }) | null;
  const unsatisfied: string[] = [];
  const satisfied: string[] = [];
  if (request.postConditions?.approved !== undefined) {
    if (after?.approved === true) satisfied.push("TRANSFER_APPROVED");
    else unsatisfied.push("TRANSFER_APPROVED");
  } else if (effect.events.length > 0) {
    satisfied.push("NATIVE_CLICK");
  } else {
    unsatisfied.push("NATIVE_CLICK");
  }

  const verified = unsatisfied.length === 0 && satisfied.length > 0;
  const state: ExecutionState = verified ? "VERIFIED" : "FAILED";
  const unsigned: Omit<EvidenceRecord, "signature"> = {
    ...base,
    authority: {
      tier: request.tier,
      policyEvaluation: "PERMITTED",
      authorizationId: lease.authorizationId,
      leaseId: lease.leaseId,
      leaseTtlMs: lease.expiresAt - lease.issuedAt,
      kid: lease.kid,
    },
    execution: {
      tabId: request.tabId,
      targetIndex: request.targetIndex,
      dispatched: true,
      state,
      targetSnapshot: liveNow.snapshot,
    },
    effect: { nativeEventsDispatched: effect.events, domMutationsObserved: effect.mutations },
    verification: {
      status: verified ? "VERIFIED" : "FAILED",
      postConditionsSatisfied: satisfied,
      unsatisfied,
    },
  };

  return {
    ok: verified,
    state,
    dispatched: true,
    lease,
    evidence: await signEvidence(unsigned),
    error: verified ? undefined : unsatisfied.join(", "),
  };
}
