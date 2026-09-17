# Browser Agent Gateway

**Security Boundary v0.1 — evaluation console**

Governed browser execution for consequential AI-agent workflows.

The agent proposes. The Gateway decides. The browser is allowed to act. Evidence proves what happened — and what was refused.

This repository is the **browser-playable evaluation console** for that boundary. It is not an enterprise-ready AI security platform. It is an executable argument: a mutation fires only under a currently valid, non-replayed, target-bound lease signed by a trusted Gateway identity.

## The invariant

> A mutation is executable only if the adapter possesses a currently valid, non-replayed, target-bound authorization signed by a trusted Gateway identity.

Every clause is load-bearing. Omission is not optional. A screenshot is not a completion. Looking like a signature is not a signature.

| Clause | What the kernel does |
| --- | --- |
| Mandatory lease | No lease, no click. `ERR_ADAPTER_LEASE_REQUIRED`. |
| Currently valid | TTL and coherence in `verifyLease`. Policy caps TTL. |
| Non-replayed | Single-use nonce consumed at dispatch. |
| Target-bound | Tab, frame, target index, and DOM hash sit inside the signed payload. |
| Signed | Unconditional Ed25519 verify. One success path. |
| Trusted identity | `kid` resolved against the trust store. Inline keys rejected. |

Capability tiers in v0.1: **R0/R1** read, **A1/A2** mutating under allowlist + 30s TTL, **A3** denied (ceremony is pilot scope), **D2** hard-disabled.

## What you can evaluate

No accounts. No server-side state. Identity is generated in the browser (`localStorage`); nonces live in memory for the session.

| Route | What it proves |
| --- | --- |
| `/demo` | Five-act flagship: governed click, geometry drift, replay, tamper, fail-closed without a key. |
| `/refusal` | Try to make it click anyway. The dispatch meter is the only number that matters. |
| `/audit` | Probes that once succeeded against this codebase. Found, fixed, still refused. |
| `/verify` | Three-state verifier: `VALID` / `INVALID` / `UNVERIFIABLE`. Copy and paste evidence JSON. |
| `/zk` | Selective disclosure lab. Zero-knowledge is not attestation. |
| `/mpc` | Joint computation lab. MPC is not a Gateway. Shares do not mint a lease. |
| `/boundary` | The v0.1 spec, including what it still does not cover. |
| `/pilot` | 30-day design-partner brief. Pricing is a willingness-to-pay hypothesis. |

A typical twelve-minute pass: **Flagship → Refusal → Self-audit → Evidence → Boundary**.

## Say / never

**Say**

- Enterprise-oriented security architecture with executable enforcement.
- Fails closed when defined invariants are violated.
- Ed25519 evidence, verifiable against a key you hold independently of the record.

**Never**

- Enterprise-ready AI security platform.
- Cryptographic proof of everything that happened.
- Human-in-the-loop approval ceremonies in v0.1 — unmatched gates deny.
- A reconstructed Shamir share is a lease.
- A zkVM journal is a receipt.

## Kernel

The browser kernel is [`src/lib/bag/doctrine.ts`](src/lib/bag/doctrine.ts). It is a hand-mirror of the Node Gateway’s `security-doctrine.ts`. A change to either file is not done until the other is updated in the same change. [`doctrine.test.ts`](src/lib/bag/doctrine.test.ts) locks the clauses — do not weaken a probe to make a demo pass.

Evidence is Ed25519. HMAC-era records are `UNVERIFIABLE`. Without a pinned key the verifier fails closed. The `kid` is derived from the key fingerprint; the console’s own identity is the only entry in the trust store. `policyId` and `policyHash` sit inside the signed lease bytes — a missing grant is malformed, a swapped hash is an invalid signature, a rotated live policy is `ERR_LEASE_POLICY_DRIFT`.

## Labs (not in the v0.1 product)

These pages exist so a sophisticated reviewer can see what the next primitives would and would not buy. They are calibrated. They do not mint leases.

- **ZK** — Schnorr OR (Sigma), Bulletproofs range, a `verifyLease` guest trace, STARK vs SNARK. A journal is not a receipt. Groth16 wrap is not post-quantum.
- **MPC** — Shamir 2-of-3 over 𝔽_p, Beaver AND, family comparison through FROST. One tab is every party and the dealer. Reconstructing a seed is the opposite of threshold signing. Conjunction of two private bits still dies at the A3 gate.

## Run it

Requires Node 22.

```bash
npm install
npm run dev
npm test
npm run typecheck
```

Auth and database are off. That is correct for a public evaluation console.

## What v0.1 still does not cover

- Channel binding is a shared bridge token, not mutual TLS.
- Nonce store is in-memory: replay protection resets on restart.
- `domHash` collides for same-tag, no-id, same-size elements and is resize-sensitive.
- No third-party pentest, SOC 2, HSM, or automated key registry.
- Human-approval ceremonies are not implemented; declared gates deny.
- The identity in the nav is generated in this browser and is not a production Gateway key.
- The Puppeteer path shares the Gateway process — defense in depth, not independent attestation. The Chrome extension is the real boundary.

See [`SECURITY.md`](SECURITY.md) for how to read the claims and how to report a real failure.

## Design partner

The remaining question is commercial: will a real organization pay to put this control layer in front of its agents? The purchase unit is one workflow, one authenticated application, one 30-day deployment.

Pricing on `/pilot` is experimental ($10k–$40k by tier), not a list price. Do not treat the low tier as the default quote.

## License

All rights reserved. This software is published for evaluation of the security boundary, not as a production Gateway. Contact [Ava Prime](https://github.com/AvaPrime) about a design-partner engagement.
