/**
 * coverage kotoba — barrel.
 *
 * World-coverage monitor with the kotoba-E2E split: public world-coverage +
 * viewpoint aggregates plaintext; per-person latent entities sealed E2E
 * (ADR-2605181100). Regulated EXECUTION (GPU/LLM embed + LDA inference,
 * crawl/ingest, fission actor-DID minting) stays etzhayyim via consent-capability.
 */
export * from "./types.js";
export {
  recordSnapshot,
  listSnapshots,
  recordViewpoint,
  listViewpoints,
  recordLatentEntity,
  listLatentEntities,
  getLatentEntity,
  coverage,
} from "./registry.js";
