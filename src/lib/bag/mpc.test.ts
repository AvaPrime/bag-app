import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MPC_P,
  conjunctionPublicView,
  hexToField,
  kernelAfterCeremony,
  proveConjunction,
  randomSecret,
  reconstructGrant,
  refuseFrost,
  refuseLeaseFromSecret,
  refuseNetwork,
  splitGrant,
  tamperShare,
} from "./mpc.ts";

describe("Shamir 2-of-3", () => {
  it("reconstructs the secret from every pair", () => {
    const split = splitGrant();
    const secret = split.secret;
    const pairs = [
      [split.shares[0]!, split.shares[1]!],
      [split.shares[0]!, split.shares[2]!],
      [split.shares[1]!, split.shares[2]!],
    ];
    for (const pair of pairs) {
      const r = reconstructGrant(pair);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.secret, secret);
    }
    const all = reconstructGrant(split.shares);
    assert.equal(all.ok, true);
    assert.equal(all.secret, secret);
  });

  it("refuses below threshold", () => {
    const split = splitGrant(randomSecret());
    const r = reconstructGrant([split.shares[0]!]);
    assert.equal(r.ok, false);
    assert.match(r.reason, /ERR_MPC_BELOW_THRESHOLD/);
    assert.equal(r.secret, null);
  });

  it("a forged share reconstructs garbage with no error", () => {
    const split = splitGrant();
    const forged = tamperShare(split.shares[2]!);
    const r = reconstructGrant([split.shares[0]!, forged]);
    assert.equal(r.ok, true, "plain Shamir does not detect a liar");
    assert.notEqual(r.secret, split.secret);
    assert.match(r.reason, /Integrity is not checked/);
  });

  it("duplicate x does not count as two shares", () => {
    const split = splitGrant();
    const dup = { ...split.shares[0]! };
    const r = reconstructGrant([split.shares[0]!, dup]);
    assert.equal(r.ok, false);
    assert.match(r.reason, /ERR_MPC_BELOW_THRESHOLD/);
  });

  it("round-trips a known secret in the field", () => {
    const secret = "0".repeat(63) + "7";
    const split = splitGrant(secret);
    assert.equal(hexToField(split.secret), 7n);
    const r = reconstructGrant([split.shares[1]!, split.shares[2]!]);
    assert.equal(r.secret, split.secret);
  });
});

describe("Beaver AND", () => {
  it("computes the four truth-table rows", () => {
    const rows: Array<[0 | 1, 0 | 1, 0 | 1]> = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [1, 1, 1],
    ];
    for (const [h, p, expect] of rows) {
      const t = proveConjunction(h, p);
      assert.equal(t.zBit, expect, `human=${h} policy=${p}`);
      assert.equal(hexToField(t.z), BigInt(expect));
    }
  });

  it("a lie about the opened d share corrupts the bit", () => {
    const honest = proveConjunction(1, 1, null);
    assert.equal(honest.zBit, 1);
    const lied = proveConjunction(1, 1, 0);
    assert.equal(lied.zBit, null);
    assert.notEqual(hexToField(lied.z), 1n);
  });

  it("public view does not include the input bits", () => {
    const t = proveConjunction(1, 0);
    const pub = conjunctionPublicView(t);
    const blob = JSON.stringify(pub);
    assert.equal("human" in pub, false);
    assert.equal("policy" in pub, false);
    assert.doesNotMatch(blob, /"human"/);
    assert.equal(pub.z, 0);
  });

  it("opened d and e are field elements, not the bits", () => {
    const t = proveConjunction(1, 1);
    const d = hexToField(t.opened.d);
    const e = hexToField(t.opened.e);
    assert.notEqual(d, 1n);
    assert.notEqual(e, 1n);
    assert.ok(d < MPC_P);
    assert.ok(e < MPC_P);
  });
});

describe("calibration", () => {
  it("shares do not mint a lease", () => {
    const r = refuseLeaseFromSecret();
    assert.equal(r.valid, false);
    assert.match(r.reason, /ERR_MPC_NOT_A_LEASE/);
  });

  it("this tab is not a network", () => {
    assert.match(refuseNetwork().reason, /ERR_MPC_NO_NETWORK/);
  });

  it("reconstructing a seed is not FROST", () => {
    assert.match(refuseFrost().reason, /ERR_MPC_NOT_FROST/);
  });

  it("AND = 1 still fails closed at the A3 gate", () => {
    const r = kernelAfterCeremony(1);
    assert.equal(r.permitted, false);
    assert.match(r.reason, /ERR_APPROVAL_GATE_DENIED/);
  });

  it("AND = 0 never reaches the kernel", () => {
    const r = kernelAfterCeremony(0);
    assert.equal(r.permitted, false);
    assert.match(r.reason, /ERR_MPC_CONJUNCTION_OFF/);
  });
});
