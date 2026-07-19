// ADR-2606021730: RisingWave → kotoba Datom log migration for latent-entity resolution
// This adapter bridges legacy RW vertex/edge queries to kotoba-native EAVT queries.
//
// Constitutional gates: G2 (edge-primary), G6 (Murakumo-only), G14 (verified-procedure).
// Honest R0 status: fixture-mode only. Live kotoba endpoint and full LDA deferred to P2-full (ADR-2605262130).

export interface LatentEntityRow {
  vertex_id: string;
  entity_kind: string;
  canonical_label: string;
  existence_probability: number;
  k_evidence_count: number;
  viewpoint_consensus: number;
  fission_eligible: boolean;
  status: string;
  created_at: string;
}

export interface EvidenceRow {
  edge_id: string;
  src_vid: string;
  dst_vid: string;
  created_at: string;
}

export interface TopicRow {
  vertex_id: string;
  topic_index: number;
  topic_label: string;
  coherence_score: number;
  top_signal_count: number;
  entity_kind_hint: string;
}

export interface EntityStats {
  entity_kind: string;
  total: number;
  avg_probability: number;
  fission_ready_count: number;
}

// Phase 2: Implement queryLatentEntities using kotoba kqe queries (EAVT mode)
// Replaces RisingWave `vertex_latent_entity` query.
export async function queryLatentEntities(
  kotobaClient: any, // @etzhayyim/sdk KotobaClient (deferred to operator gate)
  options?: {
    entityKind?: string;
    fissionOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ entities: LatentEntityRow[]; total: number }> {
  const limit = Math.min(options?.limit ?? 50, 200);
  const offset = options?.offset ?? 0;

  // HONEST R0: Fixture mode queries (no live kotoba endpoint)
  // Live kotoba kqe queries would be:
  // const aevt = await kotobaClient.kqe_aevt(
  //   e => e.entity === `:latent/entity`,
  //   { filters: [
  //       ...(options?.entityKind ? [{ a: `:latent/entity-kind`, v: options.entityKind }] : []),
  //     ],
  //     limit, offset
  //   }
  // );

  // Then aggregate :en/evidence edges to compute existence_probability on-read (G2 edge-primary, N1):
  // const entities = aevt.map(e => {
  //   const evidences = await kotobaClient.kqe_avet(`:en/evidence`, { a: e.entity });
  //   const existence = noisy_or_aggregate(evidences); // noisy-OR from orgs/etzhayyim/com-etzhayyim-tsumugi/methods/resolve.py
  //   return { ...e, existence_probability: existence };
  // });

  // For now, return fixture data (placeholder)
  const fixtureEntities: LatentEntityRow[] = [];
  return {
    entities: fixtureEntities,
    total: 0,
  };
}

// Phase 3: Implement queryEntityEvidence using kotoba kqe queries (EAVT mode)
// Replaces RisingWave `edge_entity_evidence` query + entity join.
export async function queryEntityEvidence(
  kotobaClient: any,
  entityVid: string,
  limit: number = 50
): Promise<{ entity: LatentEntityRow | null; evidence: EvidenceRow[] }> {
  limit = Math.min(limit, 200);

  // HONEST R0: Fixture mode
  // Live queries would be:
  // 1. Fetch entity record by vertex_id
  // const entityEavt = await kotobaClient.kqe_aev(
  //   e => e.entity === `:latent/entity:${entityVid}`,
  //   { limit: 1 }
  // );
  // const entity: LatentEntityRow | null = entityEavt[0] ? {
  //   vertex_id: entityVid,
  //   entity_kind: entityEavt.find(e => e.a === `:latent/entity-kind`)?.v,
  //   canonical_label: entityEavt.find(e => e.a === `:latent/label`)?.v,
  //   existence_probability: noisy_or_aggregate(await evidence_for(entityVid)),
  //   k_evidence_count: (await evidence_for(entityVid)).length,
  //   viewpoint_consensus: entityEavt.find(e => e.a === `:latent/consensus`)?.v ?? 0,
  //   fission_eligible: entityEavt.find(e => e.a === `:latent/fission-eligible`)?.v === true,
  //   status: entityEavt.find(e => e.a === `:latent/status`)?.v ?? "active",
  //   created_at: entityEavt.find(e => e.a === `:latent/created-at`)?.v,
  // } : null;

  // 2. Fetch evidence edges by dst_vid
  // const evidence = await kotobaClient.kqe_avet(
  //   `:en/evidence`,
  //   { filters: [{ v: entityVid }], limit }
  // );

  return { entity: null, evidence: [] };
}

// Phase 4: Implement getViewpointStats using kotoba EAVT aggregates
// Replaces RisingWave `vertex_lda_viewpoint` + `vertex_latent_entity` GROUP BY queries (Murakumo-only aggregation).
export async function getViewpointStats(
  kotobaClient: any
): Promise<{
  viewpoints: { vertex_id: string; viewpoint_kind: string; description: string; signal_vocab_size: number; active: boolean; created_at: string }[];
  entityStats: EntityStats[];
}> {
  // HONEST R0: Fixture mode
  // Live queries would:
  // 1. Fetch all :topic/* entities (viewpoints) filtered by active=true
  // const viewpointEavt = await kotobaClient.kqe_aevt(
  //   a => a.startsWith(":topic/"),
  //   { filters: [{ a: ":topic/active", v: true }] }
  // );
  // const viewpoints = groupBy(viewpointEavt, 'e').map(group => ({
  //   vertex_id: group[0].e,
  //   viewpoint_kind: group.find(r => r.a === ":topic/kind")?.v,
  //   description: group.find(r => r.a === ":topic/description")?.v,
  //   signal_vocab_size: parseInt(group.find(r => r.a === ":topic/vocab-size")?.v ?? "0"),
  //   active: true,
  //   created_at: group.find(r => r.a === ":topic/created-at")?.v,
  // }));

  // 2. Aggregate :latent/* entities by :latent/entity-kind via Murakumo LLM (ADR-2605215000)
  // const entityKinds = [...new Set(entities.map(e => e.entity_kind))];
  // const entityStats: EntityStats[] = entityKinds.map(kind => {
  //   const kindEntities = entities.filter(e => e.entity_kind === kind);
  //   return {
  //     entity_kind: kind,
  //     total: kindEntities.length,
  //     avg_probability: mean(kindEntities.map(e => noisy_or_aggregate(evidence_for(e.vertex_id)))),
  //     fission_ready_count: kindEntities.filter(e => e.fission_eligible).length,
  //   };
  // });

  return {
    viewpoints: [],
    entityStats: [],
  };
}

// Helper: Noisy-OR aggregation (G2 edge-primary)
// Replicates deterministic logic from orgs/etzhayyim/com-etzhayyim-tsumugi/methods/resolve.py
function noisy_or_aggregate(evidences: { confidence: number }[]): number {
  if (evidences.length === 0) return 0;
  // Noisy-OR: 1 - ∏(1 - p_i)
  const product = evidences.reduce((acc, e) => acc * (1 - e.confidence), 1);
  return 1 - product;
}

// Factory: Create a wrapped kotoba client adapter
// (Deferred: actual @etzhayyim/sdk integration, operator-gated at G11/G14)
export function createKotobaClientAdapter(endpoint?: string): any {
  // Placeholder for operator-gated client initialization
  return {
    kqe_aevt: async () => [],
    kqe_avet: async () => [],
  };
}
