import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  recordSnapshot,
  listSnapshots,
  recordViewpoint,
  listViewpoints,
  recordLatentEntity,
  listLatentEntities,
  getLatentEntity,
  coverage,
} from "../src/index.js";

const OWNER = "did:web:coverage.etzhayyim.com";

describe("coverage kotoba (kotoba-E2E split)", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: OWNER });
  });

  describe("worldCoverageSnapshot (PLAINTEXT public aggregate)", () => {
    it("records, derives rate, dedups, validates, lists/filters", async () => {
      const r = await recordSnapshot(e, { domain: "finance", collected: 50, worldTotal: 200, didCount: 5, recordCount: 80, vertexCount: 90 });
      expect(r.status).toBe("recorded");
      expect(r.coverageRatePercent).toBe(25);
      // over-coverage caps at 100
      const over = await recordSnapshot(e, { domain: "energy", collected: 300, worldTotal: 200 });
      expect(over.coverageRatePercent).toBe(100);
      // dedup by domain
      expect((await recordSnapshot(e, { domain: "finance", collected: 50, worldTotal: 200 })).status).toBe("alreadyExists");
      // validation: negative count rejected
      expect((await recordSnapshot(e, { domain: "x", collected: -1, worldTotal: 10 })).status).toBe("rejected");
      expect((await recordSnapshot(e, { domain: "", collected: 1, worldTotal: 10 })).status).toBe("rejected");
      expect((await listSnapshots(e)).total).toBe(2);
      expect((await listSnapshots(e, { domain: "finance" })).total).toBe(1);
    });
  });

  describe("viewpointStat (PLAINTEXT, FK → snapshot domain)", () => {
    it("rejects unknown domain (FK), records, dedups, validates, lists", async () => {
      // FK: domain must exist as a snapshot first
      expect((await recordViewpoint(e, { viewpointId: "vp1", domain: "finance", label: "t", entityCount: 3 })).status).toBe("rejected");
      await recordSnapshot(e, { domain: "finance", collected: 10, worldTotal: 100 });
      expect((await recordViewpoint(e, { viewpointId: "vp1", domain: "finance", label: "deceased", entityCount: 3, evidenceCount: 7 })).status).toBe("recorded");
      // dedup
      expect((await recordViewpoint(e, { viewpointId: "vp1", domain: "finance", label: "deceased", entityCount: 3 })).status).toBe("alreadyExists");
      // validation
      expect((await recordViewpoint(e, { viewpointId: "vpX", domain: "finance", label: "l", entityCount: -2 })).status).toBe("rejected");
      await recordSnapshot(e, { domain: "energy", collected: 5, worldTotal: 50 });
      await recordViewpoint(e, { viewpointId: "vp2", domain: "energy", label: "grid", entityCount: 9 });
      expect((await listViewpoints(e)).total).toBe(2);
      expect((await listViewpoints(e, { domain: "finance" })).total).toBe(1);
    });
  });

  describe("latentEntity (E2E-ENCRYPTED per-person inference)", () => {
    it("seals via encryptedWrite, round-trips via encryptedRead, validates", async () => {
      const ok = await recordLatentEntity(e, {
        entityId: "le1",
        subjectDid: "did:web:subj.example",
        entityKind: "person",
        domain: "finance",
        existenceProbabilityPercent: 72,
        fissionProposed: true,
        evidence: [{ evidenceId: "ev1", sourceKind: "census", weight: 60 }],
      });
      expect(ok.status).toBe("recorded");
      expect(ok.keyId).toBeTruthy();
      // probability > 100 rejected
      expect((await recordLatentEntity(e, { entityId: "leX", subjectDid: "d", entityKind: "person", domain: "x", existenceProbabilityPercent: 200 })).status).toBe("rejected");
      // bad evidence weight rejected
      expect((await recordLatentEntity(e, { entityId: "leY", subjectDid: "d", entityKind: "person", domain: "x", existenceProbabilityPercent: 50, evidence: [{ evidenceId: "e", sourceKind: "s", weight: 999 }] })).status).toBe("rejected");
      // round-trip decrypt
      const got = await getLatentEntity(e, { entityId: "le1" });
      expect(got.entity?.subjectDid).toBe("did:web:subj.example");
      expect(got.entity?.existenceProbabilityPercent).toBe(72);
      expect(got.entity?.evidence[0]?.evidenceId).toBe("ev1");
      // list + filters
      await recordLatentEntity(e, { entityId: "le2", subjectDid: "did:web:s2", entityKind: "org", domain: "energy", existenceProbabilityPercent: 40 });
      expect((await listLatentEntities(e)).total).toBe(2);
      expect((await listLatentEntities(e, { domain: "finance" })).total).toBe(1);
      expect((await listLatentEntities(e, { entityKind: "org" })).total).toBe(1);
      expect((await listLatentEntities(e, { fissionOnly: true })).total).toBe(1);
      expect((await getLatentEntity(e, { entityId: "missing" })).error).toBe("notFound");
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the entity", async () => {
      await recordLatentEntity(e, { entityId: "le1", subjectDid: "did:web:subj", entityKind: "person", domain: "finance", existenceProbabilityPercent: 80 });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      // outsider has no read-cap → sees zero entities
      expect((await listLatentEntities(outsider)).total).toBe(0);
    });

    it("grants read-cap to an explicit recipient", async () => {
      const partner = "did:web:partner.example";
      const r = await recordLatentEntity(e, { entityId: "le1", subjectDid: "did:web:subj", entityKind: "person", domain: "finance", existenceProbabilityPercent: 80, recipients: [partner] });
      expect(r.status).toBe("recorded");
      // owner can read
      expect((await listLatentEntities(e)).total).toBe(1);
    });
  });

  describe("coverage rollup", () => {
    it("counts plaintext snapshots + viewpoints + E2E entities, derives overall rate", async () => {
      await recordSnapshot(e, { domain: "finance", collected: 30, worldTotal: 100 });
      await recordSnapshot(e, { domain: "energy", collected: 10, worldTotal: 100 });
      await recordViewpoint(e, { viewpointId: "vp1", domain: "finance", label: "x", entityCount: 2 });
      await recordLatentEntity(e, { entityId: "le1", subjectDid: "did:web:s", entityKind: "person", domain: "finance", existenceProbabilityPercent: 70 });
      const cov = await coverage(e);
      expect(cov.snapshotCount).toBe(2);
      expect(cov.viewpointCount).toBe(1);
      expect(cov.latentEntityCount).toBe(1);
      expect(cov.collectedByDomain?.finance).toBe(30);
      // (30+10)/(100+100) = 20%
      expect(cov.overallCoverageRatePercent).toBe(20);
    });
  });
});
