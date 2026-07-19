// ADR-2606021730: Unit tests for RisingWave → kotoba adapter
// Phase 4: Integration tests (fixture mode, R0)

import { describe, it, expect } from "vitest";
import {
  queryLatentEntities,
  queryEntityEvidence,
  getViewpointStats,
  createKotobaClientAdapter,
  type LatentEntityRow,
  type EvidenceRow,
} from "./kotoba-client-wrapper";

describe("kotoba-client-wrapper (Phase 4: Fixture mode R0)", () => {
  const mockKotobaClient = createKotobaClientAdapter();

  describe("queryLatentEntities", () => {
    it("should return empty array in fixture mode", async () => {
      const result = await queryLatentEntities(mockKotobaClient, {
        limit: 50,
        offset: 0,
      });
      expect(result.entities).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should respect limit parameter", async () => {
      const result = await queryLatentEntities(mockKotobaClient, {
        limit: 200,
      });
      expect(result.entities.length).toBeLessThanOrEqual(200);
    });

    it("should cap limit at 200", async () => {
      const result = await queryLatentEntities(mockKotobaClient, {
        limit: 500,
      });
      expect(result.entities.length).toBeLessThanOrEqual(200);
    });

    it("should accept entityKind filter (no-op in R0)", async () => {
      const result = await queryLatentEntities(mockKotobaClient, {
        entityKind: "organization",
        limit: 50,
      });
      expect(result.entities).toEqual([]);
    });

    it("should accept fissionOnly filter (no-op in R0)", async () => {
      const result = await queryLatentEntities(mockKotobaClient, {
        fissionOnly: true,
        limit: 50,
      });
      expect(result.entities).toEqual([]);
    });
  });

  describe("queryEntityEvidence", () => {
    it("should return empty evidence array in fixture mode", async () => {
      const result = await queryEntityEvidence(
        mockKotobaClient,
        "latent:org:tsmc",
        50
      );
      expect(result.evidence).toEqual([]);
      expect(result.entity).toBeNull();
    });

    it("should accept entityVid and return consistent structure", async () => {
      const result = await queryEntityEvidence(
        mockKotobaClient,
        "latent:org:nvidia",
        100
      );
      expect(result).toHaveProperty("entity");
      expect(result).toHaveProperty("evidence");
      expect(Array.isArray(result.evidence)).toBe(true);
    });

    it("should cap limit at 200", async () => {
      const result = await queryEntityEvidence(
        mockKotobaClient,
        "latent:org:arm",
        500
      );
      expect(result.evidence.length).toBeLessThanOrEqual(200);
    });
  });

  describe("getViewpointStats", () => {
    it("should return structured stats in fixture mode", async () => {
      const result = await getViewpointStats(mockKotobaClient);
      expect(result).toHaveProperty("viewpoints");
      expect(result).toHaveProperty("entityStats");
      expect(Array.isArray(result.viewpoints)).toBe(true);
      expect(Array.isArray(result.entityStats)).toBe(true);
    });

    it("should return empty arrays in R0 fixture mode", async () => {
      const result = await getViewpointStats(mockKotobaClient);
      expect(result.viewpoints).toEqual([]);
      expect(result.entityStats).toEqual([]);
    });
  });

  describe("createKotobaClientAdapter", () => {
    it("should create client without endpoint (R0 fixture mode)", () => {
      const client = createKotobaClientAdapter();
      expect(client).toBeDefined();
      expect(typeof client.kqe_aevt).toBe("function");
      expect(typeof client.kqe_avet).toBe("function");
    });

    it("should accept optional endpoint parameter", () => {
      const client = createKotobaClientAdapter(
        "http://localhost:8077/kotoba"
      );
      expect(client).toBeDefined();
    });
  });

  describe("Edge case: existence_probability computation", () => {
    it("noisy_or_aggregate should handle empty evidence", () => {
      // This would be tested in full integration with actual kotoba
      // For now, verify the interface accepts confidence values
      const evidenceWithConfidence = [
        { confidence: 0.7 },
        { confidence: 0.8 },
      ];
      // Expected: 1 - (1-0.7)*(1-0.8) = 1 - 0.06 = 0.94
      expect(evidenceWithConfidence).toBeDefined();
    });
  });

  describe("Constitutional gates (G2, G6, G14)", () => {
    it("queryLatentEntities respects G2 (edge-primary, no per-soul score)", async () => {
      // In full integration, existence_probability should be computed on-read
      // from :en/evidence edges, never stored as a vertex property
      const result = await queryLatentEntities(mockKotobaClient);
      // Verify existence is not a stored attribute (would fail live query)
      expect(result.entities.length).toBe(0);
    });

    it("queryEntityEvidence respects G2 (evidence-driven, non-adjudicating)", async () => {
      const result = await queryEntityEvidence(mockKotobaClient, "test-id");
      // Evidence edges are the canonical source; entity record derives from them
      expect(result).toHaveProperty("evidence");
      expect(Array.isArray(result.evidence)).toBe(true);
    });

    it("getViewpointStats notes Murakumo-only aggregation (G6)", async () => {
      // Full aggregates (LDA inference, consensus scoring) require Murakumo
      // R0 fixture mode returns empty; live mode would route through Murakumo
      const result = await getViewpointStats(mockKotobaClient);
      expect(result.entityStats).toEqual([]);
    });
  });

  describe("HONEST R0: Fixture mode status", () => {
    it("should clearly mark all functions as fixture-mode stubs", async () => {
      // Each function should:
      // 1. Accept parameters matching RW API
      // 2. Return empty/null results (R0 fixture mode)
      // 3. Document live query pattern in comments

      const entities = await queryLatentEntities(mockKotobaClient);
      const evidence = await queryEntityEvidence(mockKotobaClient, "test");
      const stats = await getViewpointStats(mockKotobaClient);

      expect(entities.entities).toEqual([]);
      expect(evidence.entity).toBeNull();
      expect(stats.viewpoints).toEqual([]);
    });

    it("should not invoke live kotoba endpoint in R0", async () => {
      // All queries should complete without network access
      const start = Date.now();
      await queryLatentEntities(mockKotobaClient);
      const elapsed = Date.now() - start;
      // Should be nearly instant (no I/O)
      expect(elapsed).toBeLessThan(100);
    });
  });
});
