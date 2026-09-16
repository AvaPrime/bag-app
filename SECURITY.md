# Security

This repository is the **v0.1 evaluation console** for Browser Agent Gateway. It demonstrates a fail-closed kernel. It is not a production Gateway, a pentest report, or an attestation of Chrome.

## How to read the claims

- A **lease** is an Ed25519-signed, target-bound, TTL-limited authorization. No lease, no click.
- **Evidence** proves the key holder signed the record. Provenance is how you got the key. Without a pinned key the verdict is `UNVERIFIABLE`, not `VALID`.
- **ZK** and **MPC** labs are pedagogical. They use real arithmetic (Schnorr OR, Bulletproofs IPA, Shamir, Beaver). They do not prove a native click fired, and they do not mint leases.
- The identity in the nav is generated in the visitor’s browser. It is not the production Gateway’s key.

If a demo appears to dispatch without a valid lease, that is a **kernel defect**. File it.

If Shamir reconstruction does not produce a signature, if Beaver AND = 1 still dies at A3, or if a STARK tab refuses to mint a receipt — that is **calibration**, not a defect.

## Known, documented limits

These are listed on `/boundary` and are not bugs:

- Channel binding is a shared bridge token, not mutual TLS.
- Replay protection is in-memory and resets on restart.
- `domHash` is `tag:id:widthxheight` — collisions and resize sensitivity.
- A3 human-approval ceremonies are unmatched; the gate denies.
- No HSM, no automated key registry, no third-party pentest.

## Reporting a kernel failure

Open a GitHub issue with:

1. The probe or act (or a minimal reproduction).
2. The evidence JSON and the `kid` you verified against.
3. Whether `dispatched` became true.

Do not send production secrets. This console does not have a backend to receive them.

Please do not file issues asking the ZK or MPC labs to “just mint a proof.” They are built to refuse that.
