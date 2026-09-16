import { create } from "zustand";
import {
  bootstrapIdentity,
  evaluatePolicy,
  getIdentity,
  makeDomHash,
  mintLease,
  resetNonceStore,
  checkPreDispatch,
  intentHash,
  signEvidence,
  verifyEvidence,
  verifyLease,
} from "./doctrine";
import { executeAuthorizedAction, type DispatchAdapter } from "./orchestrator";
import { HMAC_ERA_EVIDENCE } from "./samples";
import { runSelfAudit } from "./probes";
import type {
  EvidenceRecord,
  ExecutionLease,
  GatewayIdentity,
  Geometry,
  KernelLog,
  ProbeResult,
  VerifyResult,
} from "./types";
import { ENTERPRISE_POLICY } from "./types";

export const TREASURY_HOST = "treasury.internal.acmebank.com";
export const TREASURY_URL = `https://${TREASURY_HOST}/wires/W-88421`;
export const APPROVE_INDEX = 2;
export const HOLD_INDEX = 3;
export const APPROVE_ID = "approve-wire";

export interface TreasuryState {
  approved: boolean;
  held: boolean;
  shiftPx: number;
  occluded: boolean;
  mutated: boolean;
  host: string;
}

interface BagState {
  ready: boolean;
  identity: GatewayIdentity | null;
  bootError: string | null;
  treasury: TreasuryState;
  targetEl: HTMLElement | null;
  dispatchCount: number;
  lastLease: ExecutionLease | null;
  lastEvidence: EvidenceRecord | null;
  ledger: EvidenceRecord[];
  logs: KernelLog[];
  probes: ProbeResult[] | null;
  verifyResult: VerifyResult | null;
  armed: boolean;
  demoRunning: boolean;
  demoAct: number;
  boot: () => Promise<void>;
  registerTarget: (el: HTMLElement | null) => void;
  setTreasury: (patch: Partial<TreasuryState>) => void;
  resetScene: () => void;
  log: (entry: Omit<KernelLog, "id" | "at">) => void;
  readLive: () => {
    geometry: Geometry;
    domHash: string;
    isOccluded: boolean;
    snapshot: { tagName: string; id: string; domHash: string; geometry: Geometry };
  } | null;
  adapter: () => DispatchAdapter;
  captureLease: (ttlMs?: number) => Promise<ExecutionLease | null>;
  dispatchCaptured: () => Promise<boolean>;
  proposeApprove: (opts?: { host?: string; ttlMs?: number }) => Promise<boolean>;
  replayLastLease: () => Promise<boolean>;
  tamperLastLease: () => Promise<boolean>;
  omitLeaseClick: () => Promise<boolean>;
  runProbes: () => Promise<void>;
  verifyRecord: (record: EvidenceRecord, withKey: boolean) => Promise<VerifyResult>;
  setDemoAct: (n: number) => void;
  setDemoRunning: (v: boolean) => void;
}

let logSeq = 0;

const initialTreasury: TreasuryState = {
  approved: false,
  held: false,
  shiftPx: 0,
  occluded: false,
  mutated: false,
  host: TREASURY_HOST,
};

function liveGeometry(el: HTMLElement): Geometry {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}

function isOccluded(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  if (!top) return false;
  if (top === el || el.contains(top)) return false;
  if (top.closest("[data-som]") || top.closest("[data-kernel-chrome]")) return false;
  return true;
}

export const useBag = create<BagState>((set, get) => ({
  ready: false,
  identity: null,
  bootError: null,
  treasury: { ...initialTreasury },
  targetEl: null,
  dispatchCount: 0,
  lastLease: null,
  lastEvidence: null,
  ledger: [],
  logs: [],
  probes: null,
  verifyResult: null,
  armed: false,
  demoRunning: false,
  demoAct: 0,

  boot: async () => {
    try {
      const identity = await bootstrapIdentity();
      set({ ready: true, identity, bootError: null });
    } catch (err) {
      set({
        ready: false,
        bootError: err instanceof Error ? err.message : "Failed to provision Gateway identity",
      });
    }
  },

  registerTarget: (el) => set({ targetEl: el }),

  setTreasury: (patch) => set((s) => ({ treasury: { ...s.treasury, ...patch } })),

  resetScene: () => {
    resetNonceStore();
    set({
      treasury: { ...initialTreasury },
      dispatchCount: 0,
      lastLease: null,
      armed: false,
      demoAct: 0,
    });
  },

  setDemoAct: (n) => set({ demoAct: n }),
  setDemoRunning: (v) => set({ demoRunning: v }),

  log: (entry) => {
    const item: KernelLog = { ...entry, id: `log_${++logSeq}`, at: Date.now() };
    set((s) => ({ logs: [...s.logs.slice(-80), item] }));
  },

  readLive: () => {
    const el = get().targetEl;
    if (!el) return null;
    const t = get().treasury;
    const geometry = liveGeometry(el);
    const id = t.mutated ? "approve-wire-mutated" : APPROVE_ID;
    const domHash = makeDomHash("button", id, geometry);
    return {
      geometry,
      domHash,
      isOccluded: t.occluded || isOccluded(el),
      snapshot: { tagName: "button", id, domHash, geometry },
    };
  },

  adapter: () => ({
    readTarget: (index) => {
      if (index !== APPROVE_INDEX) return null;
      const live = get().readLive();
      if (!live) return null;
      return {
        index,
        snapshot: live.snapshot,
        geometry: live.geometry,
        domHash: live.domHash,
        isOccluded: live.isOccluded,
        host: get().treasury.host,
        approved: get().treasury.approved,
      };
    },
    dispatchClick: (index) => {
      if (index !== APPROVE_INDEX) return { events: [], mutations: 0 };
      const el = get().targetEl;
      if (!el) return { events: [], mutations: 0 };
      const before = get().dispatchCount;
      set({ armed: true });
      el.click();
      set({ armed: false });
      if (get().dispatchCount <= before) return { events: [], mutations: 0 };
      return { events: ["pointerdown", "mousedown", "click"], mutations: 1 };
    },
  }),

  captureLease: async (ttlMs) => {
    if (!get().ready) await get().boot();
    const live = get().readLive();
    if (!live) {
      get().log({ level: "deny", message: "Cannot mint: target is not grounded." });
      return null;
    }
    const lease = await mintLease({
      agentId: ENTERPRISE_POLICY.principalId,
      tabId: 1,
      frameId: 0,
      targetIndex: APPROVE_INDEX,
      snapshot: live.snapshot,
      tier: "A2",
      ttlMs,
    });
    set({ lastLease: lease });
    get().log({
      level: "ok",
      state: "AUTHORIZED",
      message: `Lease minted ${lease.leaseId} · TTL ${lease.expiresAt - lease.issuedAt}ms · kid ${lease.kid}`,
    });
    return lease;
  },

  dispatchCaptured: async () => {
    const lease = get().lastLease;
    if (!lease) {
      get().log({
        level: "deny",
        state: "REJECTED",
        code: "ERR_ADAPTER_LEASE_REQUIRED",
        message: "No captured lease.",
      });
      return false;
    }

    const host = get().treasury.host;
    const policy = evaluatePolicy(ENTERPRISE_POLICY, "A2", host, "click_element_by_index");
    if (!policy.permitted) {
      get().log({ level: "deny", state: "REJECTED", code: "ERR_POLICY_DENIED", message: policy.reason ?? "denied" });
      return false;
    }

    const auth = await verifyLease(lease, { tabId: 1, targetIndex: APPROVE_INDEX }, { consumeNonce: true });
    if (!auth.valid) {
      get().log({
        level: "deny",
        state: "INVALIDATED",
        code: auth.reason?.split(":")[0],
        message: auth.reason ?? "lease invalid",
      });
      return false;
    }

    const liveNow = get().readLive();
    if (!liveNow) {
      get().log({ level: "deny", state: "INVALIDATED", message: "Target disappeared before dispatch." });
      return false;
    }

    const pre = checkPreDispatch(lease.targetSnapshot, liveNow);
    if (!pre.ok) {
      get().log({
        level: "deny",
        state: "INVALIDATED",
        code: pre.reason.split(":")[0],
        message: pre.reason,
      });
      const hash = await intentHash("click_element_by_index", { index: APPROVE_INDEX });
      const evidence = await signEvidence({
        evidenceId: `ev_${hash.slice(0, 12)}`,
        timestamp: new Date().toISOString(),
        intent: {
          agentId: ENTERPRISE_POLICY.principalId,
          tool: "click_element_by_index",
          params: { index: APPROVE_INDEX },
          intentHash: hash,
        },
        authority: {
          tier: "A2",
          policyEvaluation: "PERMITTED",
          authorizationId: lease.authorizationId,
          leaseId: lease.leaseId,
          leaseTtlMs: lease.expiresAt - lease.issuedAt,
          kid: lease.kid,
        },
        execution: {
          tabId: 1,
          targetIndex: APPROVE_INDEX,
          dispatched: false,
          state: "INVALIDATED",
          targetSnapshot: liveNow.snapshot,
          refusalReason: pre.reason,
        },
        effect: { nativeEventsDispatched: [], domMutationsObserved: 0 },
        verification: { status: "INVALIDATED", postConditionsSatisfied: [], unsatisfied: [pre.reason] },
      });
      set((s) => ({ lastEvidence: evidence, ledger: [...s.ledger, evidence] }));
      return false;
    }

    const before = get().dispatchCount;
    get().adapter().dispatchClick(APPROVE_INDEX, lease);
    const dispatched = get().dispatchCount > before;
    get().log({
      level: dispatched ? "ok" : "deny",
      state: dispatched ? "VERIFIED" : "FAILED",
      message: dispatched
        ? `Native events reached the DOM. Dispatches: ${get().dispatchCount}`
        : "Adapter armed but the page did not accept the click.",
    });
    return dispatched;
  },

  proposeApprove: async (opts) => {
    if (!get().ready) await get().boot();
    const host = opts?.host ?? get().treasury.host;
    get().log({
      level: "info",
      state: "PROPOSED",
      message: `Agent proposes click_element_by_index @${APPROVE_INDEX} on ${host}`,
    });

    const before = get().dispatchCount;
    const result = await executeAuthorizedAction(get().adapter(), {
      agentId: ENTERPRISE_POLICY.principalId,
      tool: "click_element_by_index",
      tier: "A2",
      tabId: 1,
      targetIndex: APPROVE_INDEX,
      host,
      ttlMs: opts?.ttlMs,
      postConditions: { approved: true },
    });

    set((s) => ({
      lastEvidence: result.evidence,
      ledger: [...s.ledger, result.evidence],
      lastLease: result.lease ?? s.lastLease,
    }));

    if (result.dispatched) {
      get().log({
        level: "ok",
        state: result.state,
        message: `Dispatched. Lease ${result.lease?.leaseId ?? "—"} · ${result.evidence.verification.status}`,
      });
    } else {
      get().log({
        level: "deny",
        state: result.state,
        code: result.error?.split(":")[0],
        message: result.error ?? "refused",
      });
    }

    return result.dispatched && get().dispatchCount > before;
  },

  replayLastLease: async () => {
    const lease = get().lastLease;
    if (!lease) {
      get().log({ level: "warn", message: "No prior lease to replay." });
      return false;
    }
    get().log({
      level: "info",
      message: `Replay attempt of ${lease.leaseId} nonce ${lease.nonce.slice(0, 8)}…`,
    });
    const v = await verifyLease(lease, { tabId: 1, targetIndex: APPROVE_INDEX }, { consumeNonce: true });
    if (!v.valid) {
      get().log({
        level: "deny",
        state: "INVALIDATED",
        code: "ERR_LEASE_NONCE_REPLAYED",
        message: v.reason ?? "replay refused",
      });
      return true;
    }
    get().log({ level: "deny", message: "REGRESSION: replay accepted" });
    return false;
  },

  tamperLastLease: async () => {
    if (!get().ready) await get().boot();
    const live = get().readLive();
    if (!live) return false;
    const valid = await mintLease({
      agentId: ENTERPRISE_POLICY.principalId,
      tabId: 1,
      frameId: 0,
      targetIndex: APPROVE_INDEX,
      snapshot: live.snapshot,
      tier: "A2",
    });
    const tampered: ExecutionLease = { ...valid, targetIndex: 99 };
    get().log({
      level: "info",
      message: `Tamper: targetIndex ${APPROVE_INDEX} → 99 on ${valid.leaseId} (signature left intact)`,
    });
    const v = await verifyLease(tampered, { tabId: 1, targetIndex: 99 });
    get().log({
      level: v.valid ? "deny" : "ok",
      state: "INVALIDATED",
      code: "ERR_LEASE_SIGNATURE_INVALID",
      message: v.valid ? "REGRESSION: tampered lease accepted" : (v.reason ?? "tamper refused"),
    });
    return !v.valid;
  },

  omitLeaseClick: async () => {
    get().log({ level: "info", message: "Mutating click with lease field omitted." });
    const before = get().dispatchCount;
    set({ armed: false });
    get().targetEl?.click();
    const after = get().dispatchCount;
    const refused = after === before;
    get().log({
      level: refused ? "ok" : "deny",
      state: "REJECTED",
      code: "ERR_ADAPTER_LEASE_REQUIRED",
      message: refused
        ? "Adapter refused: mutating action without authority"
        : "REGRESSION: ungoverned click dispatched",
    });
    return refused;
  },

  runProbes: async () => {
    if (!get().ready) await get().boot();
    const probes = await runSelfAudit();
    set({ probes });
  },

  verifyRecord: async (record, withKey) => {
    if (!get().ready) await get().boot();
    const pem = withKey ? getIdentity().publicPem : null;
    const result = await verifyEvidence(record, {
      publicPem: pem,
      expectedKid: withKey ? getIdentity().kid : undefined,
    });
    set({ verifyResult: result });
    return result;
  },
}));

export function handleTreasuryClick(): boolean {
  const s = useBag.getState();
  if (!s.armed) {
    s.log({
      level: "deny",
      state: "REJECTED",
      code: "ERR_ADAPTER_LEASE_REQUIRED",
      message: "Page click ignored. The adapter will not actuate without a Gateway lease.",
    });
    return false;
  }
  useBag.setState({
    treasury: { ...s.treasury, approved: true },
    dispatchCount: s.dispatchCount + 1,
    armed: false,
  });
  return true;
}

export { HMAC_ERA_EVIDENCE };
