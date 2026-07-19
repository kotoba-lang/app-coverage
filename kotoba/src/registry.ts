/**
 * coverage kotoba — registry.
 *
 * Plaintext path (worldCoverageSnapshot, viewpointStat): sdk.write / sdk.read —
 * public coverage aggregates. viewpointStat carries an FK to a snapshot domain,
 * enforced via an exists-check (read-by-rkey) on write.
 *
 * E2E path (latentEntity): sdk.encryptedWrite / sdk.encryptedRead — per-person
 * inference body sealed in the kotoba envelope (ADR-2605181100), read-cap =
 * owner DID + explicit recipients. The substrate never sees subjectDid in
 * plaintext. Scan/get follow the intel reference (encryptedRead + innerType
 * filter; get = scan + find by id).
 *
 * Regulated EXECUTION (GPU/LLM embed + LDA inference compute, crawl/ingest
 * pipeline, cohort-fission actor-DID minting) stays etzhayyim, consumed via
 * consent-capability — not represented as a collection here.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  LATENT_ENTITY_INNER_TYPE,
  SNAPSHOT_COLLECTION,
  VIEWPOINT_COLLECTION,
  coverageDidFor,
  isPct,
  isUint,
  latentRkey,
  ratePercent,
  snapshotRkey,
  viewpointRkey,
  type CoverageInput,
  type CoverageOutput,
  type GetLatentEntityInput,
  type GetLatentEntityOutput,
  type LatentEntityBody,
  type LatentEntityEvidence,
  type LatentEntityView,
  type ListLatentEntitiesInput,
  type ListLatentEntitiesOutput,
  type ListSnapshotsInput,
  type ListSnapshotsOutput,
  type ListViewpointsInput,
  type ListViewpointsOutput,
  type RecordLatentEntityInput,
  type RecordLatentEntityOutput,
  type RecordSnapshotInput,
  type RecordSnapshotOutput,
  type RecordViewpointInput,
  type RecordViewpointOutput,
  type ViewpointStatRecord,
  type ViewpointStatView,
  type WorldCoverageSnapshotRecord,
  type WorldCoverageSnapshotView,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

// ─── World-coverage snapshot (PLAINTEXT) ────────────────────────────

export async function recordSnapshot(e: Etzhayyim, input: RecordSnapshotInput): Promise<RecordSnapshotOutput> {
  if (!input.domain) return { status: "rejected", error: "missingRequiredFields" };
  if (!isUint(input.collected) || !isUint(input.worldTotal)) return { status: "rejected", error: "invalidCounts" };
  if (input.didCount !== undefined && !isUint(input.didCount)) return { status: "rejected", error: "invalidDidCount" };
  if (input.recordCount !== undefined && !isUint(input.recordCount)) return { status: "rejected", error: "invalidRecordCount" };
  if (input.vertexCount !== undefined && !isUint(input.vertexCount)) return { status: "rejected", error: "invalidVertexCount" };
  const rkey = snapshotRkey(input.domain);
  const existing = await e.read<WorldCoverageSnapshotRecord>({ collection: SNAPSHOT_COLLECTION, rkey }).catch(() => ({ records: [] as { uri: string; value: WorldCoverageSnapshotRecord }[] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", snapshotUri: existing.records[0].uri, did: existing.records[0].value.did, domain: input.domain, coverageRatePercent: existing.records[0].value.coverageRatePercent };
  }
  const now = new Date().toISOString();
  const did = coverageDidFor(input.domain);
  const coverageRatePercent = ratePercent(input.collected, input.worldTotal);
  const record: WorldCoverageSnapshotRecord = {
    did,
    domain: input.domain,
    collected: input.collected,
    worldTotal: input.worldTotal,
    didCount: input.didCount ?? 0,
    recordCount: input.recordCount ?? 0,
    vertexCount: input.vertexCount ?? 0,
    coverageRatePercent,
    generatedAt: input.generatedAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: SNAPSHOT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "recorded", snapshotUri: receipt.uri, did, domain: input.domain, coverageRatePercent };
}

export async function listSnapshots(e: Etzhayyim, input: ListSnapshotsInput = {}): Promise<ListSnapshotsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<WorldCoverageSnapshotRecord>({ collection: SNAPSHOT_COLLECTION, cursor: input.cursor, limit });
  const items: WorldCoverageSnapshotView[] = resp.records
    .filter((r) => !input.domain || r.value.domain === input.domain)
    .map((r) => ({ ...r.value, snapshotUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Viewpoint / topic aggregate (PLAINTEXT, FK → snapshot) ─────────

/** FK exists-check: snapshot for the domain must already be recorded. */
async function snapshotExists(e: Etzhayyim, domain: string): Promise<boolean> {
  const resp = await e.read<WorldCoverageSnapshotRecord>({ collection: SNAPSHOT_COLLECTION, rkey: snapshotRkey(domain) }).catch(() => ({ records: [] as { uri: string; value: WorldCoverageSnapshotRecord }[] }));
  return Boolean(resp.records[0]?.value);
}

export async function recordViewpoint(e: Etzhayyim, input: RecordViewpointInput): Promise<RecordViewpointOutput> {
  if (!input.viewpointId || !input.domain || !input.label) return { status: "rejected", error: "missingRequiredFields" };
  if (!isUint(input.entityCount)) return { status: "rejected", error: "invalidEntityCount" };
  if (input.evidenceCount !== undefined && !isUint(input.evidenceCount)) return { status: "rejected", error: "invalidEvidenceCount" };
  if (!(await snapshotExists(e, input.domain))) return { status: "rejected", error: "unknownDomain" };
  const rkey = viewpointRkey(input.viewpointId);
  const existing = await e.read<ViewpointStatRecord>({ collection: VIEWPOINT_COLLECTION, rkey }).catch(() => ({ records: [] as { uri: string; value: ViewpointStatRecord }[] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", viewpointUri: existing.records[0].uri, did: existing.records[0].value.did, viewpointId: input.viewpointId };
  }
  const now = new Date().toISOString();
  const did = coverageDidFor(input.viewpointId);
  const record: ViewpointStatRecord = {
    did,
    viewpointId: input.viewpointId,
    domain: input.domain,
    label: input.label,
    entityCount: input.entityCount,
    evidenceCount: input.evidenceCount ?? 0,
    generatedAt: input.generatedAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: VIEWPOINT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "recorded", viewpointUri: receipt.uri, did, viewpointId: input.viewpointId };
}

export async function listViewpoints(e: Etzhayyim, input: ListViewpointsInput = {}): Promise<ListViewpointsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ViewpointStatRecord>({ collection: VIEWPOINT_COLLECTION, cursor: input.cursor, limit });
  const items: ViewpointStatView[] = resp.records
    .filter((r) => !input.domain || r.value.domain === input.domain)
    .map((r) => ({ ...r.value, viewpointUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Latent entity (E2E-ENCRYPTED, per-person) ──────────────────────

function validEvidence(ev: LatentEntityEvidence[] | undefined): boolean {
  if (ev === undefined) return true;
  if (!Array.isArray(ev)) return false;
  return ev.every((x) => typeof x.evidenceId === "string" && x.evidenceId.length > 0 && typeof x.sourceKind === "string" && isPct(x.weight));
}

export async function recordLatentEntity(e: Etzhayyim, input: RecordLatentEntityInput): Promise<RecordLatentEntityOutput> {
  if (!input.entityId || !input.subjectDid || !input.entityKind || !input.domain) return { status: "rejected", error: "missingRequiredFields" };
  if (!isPct(input.existenceProbabilityPercent)) return { status: "rejected", error: "invalidExistenceProbability" };
  if (!validEvidence(input.evidence)) return { status: "rejected", error: "invalidEvidence" };
  const body: LatentEntityBody = {
    entityId: input.entityId,
    subjectDid: input.subjectDid,
    entityKind: input.entityKind,
    domain: input.domain,
    existenceProbabilityPercent: input.existenceProbabilityPercent,
    fissionProposed: input.fissionProposed ?? false,
    evidence: input.evidence ?? [],
    assessedAt: input.assessedAt ?? new Date().toISOString(),
  };
  // Read-cap = owner DID (sender, auto-wrapped) + any explicit recipients.
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: LATENT_ENTITY_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: latentRkey(input.entityId),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, entityId: input.entityId };
}

async function scanLatentEntities(e: Etzhayyim, maxScan: number): Promise<LatentEntityView[]> {
  const out: LatentEntityView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<LatentEntityBody>({ innerType: LATENT_ENTITY_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    }
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listLatentEntities(e: Etzhayyim, input: ListLatentEntitiesInput = {}): Promise<ListLatentEntitiesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanLatentEntities(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((x) =>
    (!input.domain || x.domain === input.domain) &&
    (!input.entityKind || x.entityKind === input.entityKind) &&
    (!input.fissionOnly || x.fissionProposed === true),
  );
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getLatentEntity(e: Etzhayyim, input: GetLatentEntityInput): Promise<GetLatentEntityOutput> {
  if (!input.entityId) return { error: "invalidEntityId" };
  const all = await scanLatentEntities(e, DEFAULT_MAX_SCAN);
  const found = all.find((x) => x.entityId === input.entityId);
  if (!found) return { error: "notFound" };
  return { entity: found };
}

// ─── Coverage rollup ────────────────────────────────────────────────

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const collectedByDomain: Record<string, number> = {};
  let snapshotCount = 0;
  let sumCollected = 0;
  let sumWorldTotal = 0;
  let cursor: string | undefined;
  while (snapshotCount < maxScan) {
    const page = await e.read<WorldCoverageSnapshotRecord>({ collection: SNAPSHOT_COLLECTION, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      collectedByDomain[r.value.domain] = (collectedByDomain[r.value.domain] ?? 0) + r.value.collected;
      sumCollected += r.value.collected;
      sumWorldTotal += r.value.worldTotal;
      snapshotCount += 1;
    }
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }

  let viewpointCount = 0;
  let vcursor: string | undefined;
  while (viewpointCount < maxScan) {
    const page = await e.read<ViewpointStatRecord>({ collection: VIEWPOINT_COLLECTION, cursor: vcursor, limit: PAGE_LIMIT });
    viewpointCount += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    vcursor = page.cursor;
  }

  const latentEntityCount = (await scanLatentEntities(e, maxScan)).length;
  return {
    snapshotCount,
    viewpointCount,
    latentEntityCount,
    collectedByDomain,
    overallCoverageRatePercent: ratePercent(sumCollected, sumWorldTotal),
    truncated: snapshotCount >= maxScan || latentEntityCount >= maxScan,
  };
}
