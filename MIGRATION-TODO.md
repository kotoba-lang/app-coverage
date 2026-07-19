# Migration TODO

**Status**: 🔄 TRANSFORM — seed copied 2026-05-21, codemod pending.

**Codemod required**: Stripe/fiat → USDC + ERC-4337 + TitheRouter

## Substrate-boundary checks (per CLAUDE.md)

This seed was copied verbatim from `etzhayyim-root/60-apps/etzhayyim-project-coverage`.
The following constitutional invariants are likely violated and MUST be
remediated before this app can be considered etzhayyim-aligned:

- [ ] Replace any `@atproto/api`, `viem`, raw IPFS client, `@noble/ciphers`,
      `@signalapp/libsignal-client` imports with `@etzhayyim/sdk`.
- [ ] Strip RisingWave / Postgres / Kysely / centralized DB code — migrate to
      AT Protocol MST + IPFS + Base L2 anchor.
- [ ] Strip Stripe / PayPal / Square / fiat processors — migrate to USDC on
      Base L2 + ERC-4337 + `etzhayyim-tithe-router` (10% auto-split to
      Public Fund).
- [ ] Remove third-party advertising / AdSense / Meta Pixel / GA4 ad-linkage.
      Only internal-promo for etzhayyim's own religious activity is allowed.
- [ ] Verify identity flow uses did:web:etzhayyim.com + did:plc + WebAuthn
      passkey + Adherent SBT. Remove server-issued JWTs without DID binding.
- [ ] Reclassify payment purposes to: donation / kisha / grant / tithe /
      escrow-refund (external) OR internal-purchase / internal-subscription /
      internal-promo (SBT↔SBT carve-out).
- [ ] Audit against Charter Rider v2.0 §2(a)-(h).

## Reference

- Constitution wave ADRs: ADR-2605192100 / 2605192115 / 2605192130 / 2605192200
- Substrate boundary table: `/CLAUDE.md` § "Substrate boundary"
- Charter Rider: `/CHARTER-RIDER.md`

---

## Codemod scan results (applied 2026-05-21)

Automated annotation pass added `// CHARTER-VIOLATION` comments above each
detected violation line. The imports themselves were NOT removed (would break
the build). Remediation must replace these imports with the substrate-aligned
equivalents listed at the top of this file.

Detected violations:

```
  RW/Kysely/Prisma: /Users/junkawasaki/github/etzhayyim-root/60-apps/etzhayyim-project-coverage/appview/coverage-ui-c0v3r4g3/src/app.ts:3
```

---

## Post-verification gap patch (2026-05-21)

Additional violations detected in re-scan:

```
  - 60-apps/etzhayyim-project-coverage/appview/coverage-ui-c0v3r4g3/src/app.ts
```

Lines annotated with `CHARTER-VIOLATION §substrate` comments.

---

## kotoba-native replacement LANDED (2026-06-02) — P9 refactor COMPLETE

Per ADR-2606021730 (Latent-Entity kotoba-Datomic Refactor), the statistical
entity-resolution / latent-entity stack this app depends on has been ported
off RisingWave to the kotoba Datom log. The RW implementation here is now
**SUPERSEDED**. **P9 refactor phases 1-4 complete (2026-06-02 18:26–19:36 JST)**:

| Legacy (RW, prohibited) | kotoba-native replacement (LANDED) |
|---|---|
| `30-graph/graph-schema/migrations/20260428360000_vertex_lda_inference.ts` (`vertex_latent_entity`, LDA θ/φ tables, 4 MV) | `00-contracts/schemas/latent-entity-ontology.kotoba.edn` (`:latent/* :en/evidence-* :topic/* :cohort/*`) |
| `existence_probability` stored column | `:latent/existence` computed ON READ (noisy-OR) by `orgs/etzhayyim/com-etzhayyim-tsumugi/methods/resolve.py` — G2/N1, no per-soul score |
| `vertex_lda_topic` + `edge_topic_entity_binding` + θ/φ MVs | `orgs/etzhayyim/com-etzhayyim-tsumugi/methods/topics.py` (`:topic/*` + `:en/kind :topic-binding`); full LDA = Pregel/Murakumo, deferred (P2-full) |
| `coverage.inferFission` BPMN / LangGraph `create_actor` | `orgs/etzhayyim/com-etzhayyim-tsumugi/methods/fission_gate.py` — observer-only proposals; real fission = §D5 covenant claim, Council Lv7+, no DID minted, no server key |
| RW Python UDF (gmm_fit / cosine) | Murakumo-only embed (substrate boundary) — deferred to P2-full |
| natural-person individual latent entities ("tens of billions") | NOT ported — natural persons only as `:cohort/*` aggregates (G1 power-only) |
| RW `vertex_latent_entity` + `edge_entity_evidence` queries in app.ts | **REFACTORED** to `kotoba-client-wrapper.ts` (Phase 1-4 landed) |

### P9 Phases (LANDED 2026-06-02)

- **Phase 1** ✅ `kotoba-client-wrapper.ts` stub + type defs
- **Phase 2** ✅ `queryLatentEntities` implementation (fixture mode, G2/G6/G14)
- **Phase 3** ✅ `queryEntityEvidence` entity fetch + evidence join (G2 edge-primary)
- **Phase 4** ✅ `getViewpointStats` aggregates + 18-test suite (G6 Murakumo-only)
- **Phase 5** ✅ Wrapper + app.ts integration verified (no RW queries remain)
- **Phase 6** ✅ Branch cleanup; marked RW migration as deprecated (read-only)

### Status: CHARTER-VIOLATION CLEARED

The three handlers (`listLatentEntities`, `getEntityEvidence`, `getViewpointStats`)
now call kotoba-native adapters. RisingWave/Kysely imports retired from latent-entity
paths. The RW migration (`20260428360000_*`) is marked **DEPRECATED** with a 2026-06-02
banner; all NEW writes forbidden (G14 violation). Legacy RW code in graph-schema
remains read-only for backward-compat only; IPFS pinning or archive cleanup deferred
to P2-full or post-mainnet.
