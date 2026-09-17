import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/verdict";
import { HMAC_ERA_EVIDENCE, useBag } from "@/lib/bag/store";
import { FORGED_WIRE_CLAIM } from "@/lib/bag/samples";
import { parseEvidenceJson } from "@/lib/bag/evidence-io";
import { getIdentity, verifyEvidence } from "@/lib/bag/doctrine";
import type { EvidenceRecord, VerifyResult } from "@/lib/bag/types";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/verify")({ component: VerifyPage });

function VerifyPage() {
  const lastEvidence = useBag((s) => s.lastEvidence);
  const identity = useBag((s) => s.identity);
  const [keyOn, setKeyOn] = useState(false);
  const [source, setSource] = useState<"last" | "hmac" | "forged" | "pasted">("last");
  const [pasted, setPasted] = useState<EvidenceRecord | null>(null);
  const [draft, setDraft] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const record: EvidenceRecord | null = useMemo(() => {
    if (source === "hmac") return HMAC_ERA_EVIDENCE;
    if (source === "forged") return FORGED_WIRE_CLAIM;
    if (source === "pasted") return pasted;
    return lastEvidence;
  }, [source, lastEvidence, pasted]);

  async function run() {
    if (!record) return;
    setBusy(true);
    try {
      const bag = useBag.getState();
      if (!bag.ready) await bag.boot();
      const id = getIdentity();
      const pem = keyOn ? id.publicPem : null;
      setResult(await verifyEvidence(record, { publicPem: pem, expectedKid: keyOn ? id.kid : undefined }));
    } finally {
      setBusy(false);
    }
  }

  async function copyRecord() {
    if (!record) return;
    const text = JSON.stringify(record, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setPasteNote("Copied. Someone else can paste this into Verify — they still need your public key.");
    } catch {
      setCopied(false);
      setPasteNote("Clipboard blocked. Select the JSON and copy it.");
    }
  }

  function applyPaste() {
    const parsed = parseEvidenceJson(draft);
    if (!parsed.ok) {
      setPasteNote(parsed.reason);
      return;
    }
    setPasted(parsed.record);
    setSource("pasted");
    setResult(null);
    setPasteNote("Pasted record loaded. Pin a key obtained out of band.");
  }

  return (
    <main className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="font-mono text-[12px] text-subtle">Independent witness</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
          Three states. Never a polite pass.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          A valid signature proves the key holder signed it. Provenance comes from how you got the key. Run the verifier without a key first so it refuses. Then supply the key.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["hmac", "HMAC-era sample"],
              ["last", "Last execution"],
              ["forged", "Forged $4.2m wire"],
              ["pasted", "Pasted JSON"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSource(id);
                setResult(null);
                setCopied(false);
              }}
              className={cn(
                "h-11 rounded-md px-3 text-sm shadow-[var(--shadow-border)]",
                source === id ? "bg-elevated text-fg" : "bg-surface text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-5 flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={keyOn}
            onChange={(e) => {
              setKeyOn(e.target.checked);
              setResult(null);
            }}
            className="size-4 accent-accent"
          />
          Pin this console’s Gateway public key
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void run()} disabled={busy || !record}>
            Verify evidence
          </Button>
          <Button variant="secondary" onClick={() => void copyRecord()} disabled={!record}>
            {copied ? "Copied" : "Copy JSON"}
          </Button>
          {source === "last" && !lastEvidence ? (
            <p className="self-center text-sm text-subtle">
              No evidence loaded yet. Run Flagship, or paste a record you already have.
            </p>
          ) : null}
        </div>

        <label className="mt-5 block min-w-0">
          <span className="font-mono text-[11px] text-subtle">Paste a record</span>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setCopied(false);
            }}
            rows={6}
            spellCheck={false}
            className="mt-2 w-full min-w-0 resize-y rounded-md bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed text-fg shadow-[var(--shadow-border)]"
            placeholder='{"evidenceId": "…", "signature": { "alg": "Ed25519", "value": "…" }}'
          />
        </label>
        <div className="mt-2">
          <Button variant="secondary" onClick={applyPaste} disabled={!draft.trim()}>
            Use pasted JSON
          </Button>
        </div>
        {pasteNote ? <p className="mt-3 text-sm text-muted">{pasteNote}</p> : null}

        {result ? (
          <div className="mt-6 rounded-xl bg-elevated p-5 shadow-[var(--shadow-border)]">
            <VerdictBadge verdict={result.verdict} />
            <p className="mt-3 text-sm leading-relaxed text-muted">{result.reason}</p>
            <p className="mt-2 font-mono text-[11px] text-faint">
              cryptographic check {result.checked ? "performed" : "not performed"}
            </p>
          </div>
        ) : null}

        <p className="mt-6 text-sm text-subtle">
          {identity ? `This browser’s kid ${identity.kid}. Fingerprint ${identity.fingerprint}. Not the production Gateway.` : null}{" "}
          HMAC-SHA256 without a shared secret is UNVERIFIABLE. Inline key material is INVALID. Missing key is UNVERIFIABLE, not VALID.
        </p>
      </div>

      <aside className="min-w-0 rounded-xl bg-inset p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="font-mono text-[12px] text-subtle">Record under audit</p>
        <pre className="mt-3 max-h-[520px] min-w-0 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted">
          {record
            ? JSON.stringify(record, null, 2)
            : "No evidence loaded yet. Run Flagship, or paste a record you already have."}
        </pre>
      </aside>
    </main>
  );
}
