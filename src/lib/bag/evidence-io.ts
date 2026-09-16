import type { EvidenceRecord } from "./types.ts";

export function parseEvidenceJson(
  text: string,
): { ok: true; record: EvidenceRecord } | { ok: false; reason: string } {
  const raw = text.trim();
  if (!raw) return { ok: false, reason: "Paste is empty." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Paste is not JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "Paste is not an evidence object." };
  }
  const rec = parsed as Partial<EvidenceRecord>;
  if (typeof rec.evidenceId !== "string" || !rec.evidenceId) {
    return { ok: false, reason: "Missing evidenceId." };
  }
  if (!rec.signature || typeof rec.signature !== "object") {
    return { ok: false, reason: "Missing signature." };
  }
  if (rec.signature.alg !== "Ed25519" && rec.signature.alg !== "HMAC-SHA256") {
    return { ok: false, reason: `Unrecognized signature algorithm ${String(rec.signature.alg)}.` };
  }
  if (typeof rec.signature.value !== "string" || !rec.signature.value) {
    return { ok: false, reason: "Missing signature value." };
  }
  return { ok: true, record: rec as EvidenceRecord };
}
