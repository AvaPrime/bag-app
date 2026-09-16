import { Badge } from "@/components/ui/badge";
import type { EvidenceVerdict, ExecutionState } from "@/lib/bag/types";

export function VerdictBadge({ verdict }: { verdict: EvidenceVerdict }) {
  const tone = verdict === "VALID" ? "ok" : verdict === "INVALID" ? "deny" : "warn";
  return <Badge tone={tone}>{verdict}</Badge>;
}

export function StateBadge({ state }: { state: ExecutionState }) {
  const tone =
    state === "VERIFIED" || state === "AUTHORIZED" || state === "DISPATCHED"
      ? "ok"
      : state === "REJECTED" || state === "INVALIDATED" || state === "FAILED"
        ? "deny"
        : "neutral";
  return <Badge tone={tone}>{state}</Badge>;
}
