import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEvaluationPacket } from "./packet.ts";
import { HMAC_ERA_EVIDENCE } from "./samples.ts";
import { ENTERPRISE_POLICY } from "./types.ts";

describe("evaluation packet", () => {
  it("is a self-contained HTML receipt without private key material", async () => {
    const html = await buildEvaluationPacket({
      kid: "gateway-eval-2026-09-abcd1234",
      fingerprint: "abcd 1234 eeee ffff",
      publicPem: "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----",
      lastLease: null,
      lastEvidence: HMAC_ERA_EVIDENCE,
      probes: [
        {
          id: "P-00",
          finding: "baseline",
          attack: "authentic lease",
          detected: "2026-09-16",
          refused: true,
          detail: "ok",
        },
      ],
    });
    assert.match(html, /<!DOCTYPE html>/);
    assert.match(html, /gateway-eval-2026-09-abcd1234/);
    assert.match(html, /BEGIN PUBLIC KEY/);
    assert.match(html, new RegExp(ENTERPRISE_POLICY.policyId));
    assert.match(html, /P-00/);
    assert.match(html, /#f3f1eb/);
    assert.equal(html.includes("PRIVATE KEY"), false);
    assert.equal(html.includes("pkcs8"), false);
    assert.equal(html.includes("privatePkcs8"), false);
  });
});
