import { createKyselyDb, createWorkerExport, nsid, type HostSDK } from "@etzhayyim/kotodama-host-sdk";
import type { Database } from "@etzhayyim/graph-schema";
// ADR-2606021730 Phase 2+: replacing RW queries with kotoba EAVT queries
import { queryLatentEntities, queryEntityEvidence, getViewpointStats, createKotobaClientAdapter } from "./kotoba-client-wrapper";
// CHARTER-VIOLATION §substrate (centralized DB forbidden): migrate to AT MST + IPFS + Base L2 anchor
// Kept for backward-compat queries like mv_world_coverage_live (non-latent-entity); deprecated for latent-entity paths.
import { Kysely } from "kysely"; // kotoba-datomic-projection: ADR-2605231500 mv_world_coverage_live derived read

type CoverageRow = {
  domain: string;
  did_count: number | null;
  record_count: number | null;
  vertex_count: number | null;
  collected: number | null;
  world_total: number | null;
  coverage_rate: number | null;
};

type PriorityRow = {
  domain: string;
  collected: number;
  worldTotal: number;
  coverageRate: number;
  remaining: number;
};

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function summarize(rows: CoverageRow[]) {
  const normalized = rows.map((row) => {
    const collected = asNumber(row.collected);
    const worldTotal = asNumber(row.world_total);
    const coverageRate = typeof row.coverage_rate === "number" && Number.isFinite(row.coverage_rate)
      ? row.coverage_rate
      : (worldTotal > 0 ? collected / worldTotal : 0);
    return {
      domain: row.domain,
      didCount: asNumber(row.did_count),
      recordCount: asNumber(row.record_count),
      vertexCount: asNumber(row.vertex_count),
      collected,
      worldTotal,
      coverageRate,
      remaining: Math.max(worldTotal - collected, 0),
    };
  });

  const summary = normalized.reduce((acc, row) => {
    acc.domains += 1;
    acc.sumCollected += row.collected;
    acc.sumWorldTotal += row.worldTotal;
    acc.sumDidCount += row.didCount;
    acc.sumRecordCount += row.recordCount;
    acc.sumVertexCount += row.vertexCount;
    if (row.collected > 0) acc.nonzeroDomains += 1;
    if (row.collected === 0) acc.zeroDomains += 1;
    if (row.worldTotal > 0 && row.coverageRate >= 1) acc.fullOrOverDomains += 1;
    return acc;
  }, {
    domains: 0,
    nonzeroDomains: 0,
    zeroDomains: 0,
    fullOrOverDomains: 0,
    sumCollected: 0,
    sumWorldTotal: 0,
    sumDidCount: 0,
    sumRecordCount: 0,
    sumVertexCount: 0,
  });

  const overallCoverageRate = summary.sumWorldTotal > 0
    ? summary.sumCollected / summary.sumWorldTotal
    : 0;

  const zeroCoverage = normalized
    .filter((row) => row.collected === 0)
    .sort((a, b) => b.worldTotal - a.worldTotal)
    .slice(0, 12);

  const strategicBacklog = normalized
    .filter((row) => row.coverageRate > 0 && row.coverageRate < 0.01)
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 12);

  const nearWins = normalized
    .filter((row) => row.coverageRate >= 0.4 && row.coverageRate < 1)
    .sort((a, b) => b.coverageRate - a.coverageRate || a.remaining - b.remaining)
    .slice(0, 12);

  const denominatorAlerts = normalized
    .filter((row) => row.worldTotal > 0 && row.collected > row.worldTotal)
    .sort((a, b) => (b.collected - b.worldTotal) - (a.collected - a.worldTotal))
    .slice(0, 20);

  const smallestCoverage = normalized
    .filter((row) => row.coverageRate > 0)
    .sort((a, b) => a.coverageRate - b.coverageRate || b.worldTotal - a.worldTotal)
    .slice(0, 12);

  return {
    evaluatedAt: new Date().toISOString(),
    summary: {
      ...summary,
      overallCoverageRate,
    },
    priorities: {
      zeroCoverage,
      strategicBacklog,
      nearWins,
      smallestCoverage,
      denominatorAlerts,
    },
    rows: normalized,
  };
}

async function loadWorldCoverage(sdk: HostSDK) {
  const db = createKyselyDb((sdk.env as any).HYPERDRIVE) as unknown as Kysely<Database>;
  const rows = await db
    .selectFrom("mv_world_coverage_live")
    .select([
      "domain",
      "did_count",
      "record_count",
      "vertex_count",
      "collected",
      "world_total",
      "coverage_rate",
    ])
    .execute() as CoverageRow[];
  return summarize(rows);
}

export default createWorkerExport((sdk) => {
  sdk.app.query(nsid("com.etzhayyim.apps.coverage.getWorldCoverage"), async (_ctx, _body) => {
    return await loadWorldCoverage(sdk);
  });

  sdk.app.query(nsid("com.etzhayyim.apps.coverage.listLatentEntities"), async (_ctx, body) => {
    // Phase 2: kotoba latent-entity query (G2 edge-primary, G6 Murakumo-only, G14 verified)
    const args = body as Record<string, unknown>;
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const offset = Number(args.offset ?? 0);
    const entityKind = typeof args.entityKind === "string" ? args.entityKind : undefined;
    const fissionOnly = args.fissionOnly === true || args.fissionOnly === "true";

    // HONEST R0: Fixture mode (kotoba endpoint operator-gated at G14)
    const kotobaClient = createKotobaClientAdapter((sdk.env as any).KOTOBA_ENDPOINT);
    const { entities, total } = await queryLatentEntities(kotobaClient, {
      entityKind,
      fissionOnly,
      limit,
      offset,
    });

    return { entities, total, offset, limit };
  });

  sdk.app.query(nsid("com.etzhayyim.apps.coverage.getEntityEvidence"), async (_ctx, body) => {
    // Phase 3: kotoba evidence-edge query + entity join (G2 edge-primary)
    const args = body as Record<string, unknown>;
    const entityVid = String(args.entityVid ?? "");
    if (!entityVid) return { error: "entityVid required" };
    const limit = Math.min(Number(args.limit ?? 50), 200);

    // HONEST R0: Fixture mode (kotoba endpoint operator-gated at G14)
    const kotobaClient = createKotobaClientAdapter((sdk.env as any).KOTOBA_ENDPOINT);
    const { entity, evidence } = await queryEntityEvidence(kotobaClient, entityVid, limit);

    return { entity, evidence };
  });

  sdk.app.query(nsid("com.etzhayyim.apps.coverage.getViewpointStats"), async (_ctx, _body) => {
    // Phase 4: kotoba topic/viewpoint aggregates (G2 edge-primary, Murakumo-only aggregation)
    // HONEST R0: Fixture mode (full LDA deferred to P2-full per ADR-2605262130)
    const kotobaClient = createKotobaClientAdapter((sdk.env as any).KOTOBA_ENDPOINT);
    const { viewpoints, entityStats } = await getViewpointStats(kotobaClient);

    return {
      viewpoints,
      entityStats,
      evaluatedAt: new Date().toISOString(),
    };
  });
});
