import { hashPolicyGrant } from "./doctrine.ts";
import { ENTERPRISE_POLICY, type EvidenceRecord, type ExecutionLease, type ProbeResult } from "./types.ts";

export interface PacketInput {
  kid: string;
  fingerprint: string;
  publicPem: string;
  lastLease: ExecutionLease | null;
  lastEvidence: EvidenceRecord | null;
  probes: ProbeResult[] | null;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

export async function buildEvaluationPacket(input: PacketInput): Promise<string> {
  const policyHash = await hashPolicyGrant(ENTERPRISE_POLICY);
  const probes = input.probes ?? [];
  const refused = probes.filter((p) => p.refused).length;
  const probeRows =
    probes.length === 0
      ? `<tr><td colspan="3">Self-audit was not run in this session.</td></tr>`
      : probes
          .map((p) => {
            const tone = p.refused ? "#34d399" : "#fb7185";
            const label = p.refused ? (p.id === "P-00" ? "HOLD" : "REFUSED") : "OPEN";
            return `<tr>
              <td>${esc(p.id)}</td>
              <td><span class="dot" style="background:${tone}"></span>${esc(label)}</td>
              <td>${esc(p.attack)}</td>
            </tr>`;
          })
          .join("");

  const leaseBlock = input.lastLease
    ? `<pre>${esc(
        JSON.stringify(
          {
            leaseId: input.lastLease.leaseId,
            kid: input.lastLease.kid,
            tier: input.lastLease.tier,
            policyId: input.lastLease.policyId,
            policyHash: input.lastLease.policyHash,
            expiresAt: input.lastLease.expiresAt,
          },
          null,
          2,
        ),
      )}</pre>`
    : `<p class="muted">No lease minted in this session.</p>`;

  const evidenceBlock = input.lastEvidence
    ? `<pre>${esc(JSON.stringify(input.lastEvidence, null, 2))}</pre>`
    : `<p class="muted">No evidence loaded. Run Flagship, or paste a record on the verifier.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>BAG evaluation packet · ${esc(input.kid)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    max-width: 760px;
    padding: 48px 32px 72px;
    background: #f3f1eb;
    color: #1c1917;
    font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    line-height: 1.5;
  }
  h1 { font-size: 2rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1.1; margin: 12px 0 0; }
  h2 { font-size: 0.95rem; font-weight: 600; margin: 36px 0 10px; }
  p { margin: 8px 0; }
  .muted { color: #57534e; }
  .kicker { font-family: ui-monospace, "IBM Plex Mono", monospace; font-size: 12px; color: #57534e; }
  pre, .pem {
    background: #fffdf8;
    border: 1px solid #e7e0d4;
    padding: 14px 16px;
    overflow: auto;
    font-family: ui-monospace, "IBM Plex Mono", monospace;
    font-size: 11px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e7e0d4; vertical-align: top; }
  th { color: #57534e; font-weight: 500; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 99px; margin-right: 8px; }
  .warn { margin-top: 40px; color: #57534e; font-size: 13px; }
  @media print {
    body { padding: 0; max-width: none; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
  <p class="kicker">Browser Agent Gateway · Security Boundary v0.1</p>
  <h1>Evaluation packet</h1>
  <p class="muted">A record from a browser evaluation console. Not a production attestation, pentest report, or certification of Chrome.</p>

  <h2>Identity</h2>
  <p>kid <strong>${esc(input.kid)}</strong></p>
  <p>fingerprint ${esc(input.fingerprint)}</p>
  <p class="muted">Generated in the evaluator’s browser. Not the production Gateway’s key.</p>
  <pre class="pem">${esc(input.publicPem)}</pre>

  <h2>Grant</h2>
  <p>policyId <strong>${esc(ENTERPRISE_POLICY.policyId)}</strong></p>
  <p>policyHash ${esc(policyHash)}</p>
  <p class="muted">SHA-256 of the canonical grant. A lease missing this hash is malformed; a swapped hash is an invalid signature.</p>
  ${leaseBlock}

  <h2>Self-audit</h2>
  <p>${probes.length ? `${refused}/${probes.length} refused` : "Not run."}</p>
  <table>
    <thead><tr><th>Probe</th><th>Result</th><th>Attack</th></tr></thead>
    <tbody>${probeRows}</tbody>
  </table>

  <h2>Last evidence</h2>
  ${evidenceBlock}

  <p class="warn">A valid signature proves the key holder signed the record. Provenance is how you got the key above. HMAC-era samples are UNVERIFIABLE. Zero-knowledge and MPC labs are not in this packet — they do not mint leases.</p>
</body>
</html>`;
}

export function downloadEvaluationPacket(html: string, kid: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bag-evaluation-${kid}.html`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
