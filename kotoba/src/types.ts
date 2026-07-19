/**
 * coverage kotoba — world-coverage monitor, kotoba-E2E split.
 *
 * Per ADR-2606011400 (Consensys product-front / infra-back) + ADR-2605172400
 * (3-axis OR-test) + ADR-2605181100 (kotoba E2E encrypted-record envelope) +
 * ADR-2606021730 (latent-entity kotoba-Datomic refactor; LDA θ/φ off the legacy
 * derived store). Founder directive 2026-06-03: front everything that can move;
 * only the irreducible regulated EXECUTION stays etzhayyim.
 *
 * The legacy coverage monitor read a derived world-coverage view + a statistical
 * latent-entity / entity-resolution stack (per-person, "tens of billions"). The
 * split below fronts both the public aggregate AND the per-person inference —
 * the latter sealed E2E so the substrate never sees subject identity.
 *
 * SPLIT (maximal migration):
 *   PUBLIC (plaintext AT records) — world-coverage aggregates by domain
 *   (collected / worldTotal / rate) and viewpoint/topic aggregate stats. No
 *   subject identity; pure denominator + coverage metadata. Frontable.
 *
 *   SENSITIVE (kotoba E2E, com.etzhayyim.encrypted.record) — per-person latent
 *   entities (subjectDid + existence probability + resolution evidence). This is
 *   per-natural-person inference, written via sdk.encryptedWrite (read-cap =
 *   owner DID + explicit recipients), so confidential entity resolution lives
 *   on-substrate encrypted, not etzhayyim-resident.
 *
 *   STAYS etzhayyim (consumed via consent-capability, NOT a collection) — the
 *   regulated EXECUTION acts: GPU/LLM embedding + LDA inference compute
 *   (Murakumo-only per ADR-2606021730), the crawl/ingest collection pipeline,
 *   and the cohort-fission ENFORCEMENT action (minting a new actor DID). Those
 *   acts stay etzhayyim; their resulting DATA records front (plaintext or E2E).
 *
 * AT-Lexicon: no float. Counts are non-negative integers; coverage rate and
 * existence probability are integer percent 0-100; any decimal is a string.
 */

// ─── Collections / inner-types ──────────────────────────────────────

// Plaintext public aggregate collections.
export const SNAPSHOT_COLLECTION = "com.etzhayyim.apps.coverage.worldCoverageSnapshot";
export const VIEWPOINT_COLLECTION = "com.etzhayyim.apps.coverage.viewpointStat";
// E2E inner-type NSID (body shape inside the encrypted envelope).
export const LATENT_ENTITY_INNER_TYPE = "com.etzhayyim.apps.coverage.latentEntity";

export const COVERAGE_DID_PREFIX = "did:web:coverage.etzhayyim.com:" as const;

// ─── World-coverage snapshot (PLAINTEXT, public aggregate) ──────────

export interface WorldCoverageSnapshotRecord {
  did: string;
  domain: string;
  /** non-negative integers. */
  collected: number;
  worldTotal: number;
  didCount: number;
  recordCount: number;
  vertexCount: number;
  /** integer percent 0-100 (collected/worldTotal). */
  coverageRatePercent: number;
  generatedAt: string;
  createdAt: string;
}
export interface WorldCoverageSnapshotView extends WorldCoverageSnapshotRecord {
  snapshotUri: string;
}
export interface RecordSnapshotInput {
  domain: string;
  collected: number;
  worldTotal: number;
  didCount?: number;
  recordCount?: number;
  vertexCount?: number;
  generatedAt?: string;
}
export interface RecordSnapshotOutput {
  status: "recorded" | "alreadyExists" | "rejected";
  snapshotUri?: string;
  did?: string;
  domain?: string;
  coverageRatePercent?: number;
  error?: string;
}
export interface ListSnapshotsInput {
  domain?: string;
  limit?: number;
  cursor?: string;
}
export interface ListSnapshotsOutput {
  items: WorldCoverageSnapshotView[];
  cursor?: string;
  total: number;
}

// ─── Viewpoint / topic aggregate stat (PLAINTEXT, public) ───────────
// FK: each viewpoint references a snapshot domain (exists-check on write).

export interface ViewpointStatRecord {
  did: string;
  viewpointId: string;
  /** FK → worldCoverageSnapshot.domain */
  domain: string;
  label: string;
  entityCount: number;
  evidenceCount: number;
  generatedAt: string;
  createdAt: string;
}
export interface ViewpointStatView extends ViewpointStatRecord {
  viewpointUri: string;
}
export interface RecordViewpointInput {
  viewpointId: string;
  domain: string;
  label: string;
  entityCount: number;
  evidenceCount?: number;
  generatedAt?: string;
}
export interface RecordViewpointOutput {
  status: "recorded" | "alreadyExists" | "rejected";
  viewpointUri?: string;
  did?: string;
  viewpointId?: string;
  error?: string;
}
export interface ListViewpointsInput {
  domain?: string;
  limit?: number;
  cursor?: string;
}
export interface ListViewpointsOutput {
  items: ViewpointStatView[];
  cursor?: string;
  total: number;
}

// ─── Latent entity (E2E-ENCRYPTED, per-person inference) ────────────

export interface LatentEntityEvidence {
  evidenceId: string;
  sourceKind: string;
  /** integer percent 0-100. */
  weight: number;
}
export interface LatentEntityBody {
  entityId: string;
  /** Per-person subject identity — never plaintext on substrate. */
  subjectDid: string;
  entityKind: string;
  domain: string;
  /** integer percent 0-100 (noisy-OR existence, computed off-substrate). */
  existenceProbabilityPercent: number;
  /** Observer-only fission proposal flag (no DID minted here; that EXECUTION stays etzhayyim). */
  fissionProposed: boolean;
  evidence: LatentEntityEvidence[];
  assessedAt: string;
}
export interface LatentEntityView extends LatentEntityBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface RecordLatentEntityInput {
  entityId: string;
  subjectDid: string;
  entityKind: string;
  domain: string;
  existenceProbabilityPercent: number;
  fissionProposed?: boolean;
  evidence?: LatentEntityEvidence[];
  assessedAt?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface RecordLatentEntityOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  entityId?: string;
  error?: string;
}
export interface ListLatentEntitiesInput {
  domain?: string;
  entityKind?: string;
  fissionOnly?: boolean;
  limit?: number;
}
export interface ListLatentEntitiesOutput {
  items: LatentEntityView[];
  total: number;
}
export interface GetLatentEntityInput {
  entityId: string;
}
export interface GetLatentEntityOutput {
  entity?: LatentEntityView;
  error?: string;
}

// ─── Coverage rollup ────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  snapshotCount?: number;
  viewpointCount?: number;
  latentEntityCount?: number;
  collectedByDomain?: Record<string, number>;
  /** integer percent 0-100, sum(collected)/sum(worldTotal). */
  overallCoverageRatePercent?: number;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export function isUint(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}
export function isPct(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}
/** Integer-percent coverage rate, clamped 0-100 (over-coverage caps at 100). */
export function ratePercent(collected: number, worldTotal: number): number {
  if (worldTotal <= 0) return 0;
  return Math.min(100, Math.round((collected / worldTotal) * 100));
}
export function coverageDidFor(id: string): string {
  return `${COVERAGE_DID_PREFIX}dom:${id.toLowerCase()}`;
}
export function snapshotRkey(domain: string): string {
  return `snap-${domain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
export function viewpointRkey(id: string): string {
  return `vp-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
export function latentRkey(id: string): string {
  return `le-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
