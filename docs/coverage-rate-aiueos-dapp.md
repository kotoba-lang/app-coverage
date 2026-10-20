# app-coverage（率計算）— itonami（dapp）上の分散型設計

状態: 第 1 スライス実装（2026-10-20）。正本はこの文書。
追跡: Linear JUN-128（親 JUN-116）。

## 位置づけ

app-coverage は world-coverage モニタ —— ドメイン別カバレッジの集計
（**no float 規約**の AT レコード: 数え値は非負整数、率と存在確率は
0-100 の整数 percent、小数は文字列）。E2E で密な側（latent entity）と
公開の集計面を分離。

## このスライス: 率計算判定コア

| 層 | 実体 | 状態 |
|---|---|---|
| 判定コア guest | `aiueos/coverage_rate.cljk` — rate-percent（**worldTotal 0 以下は 0、round(収集/総数 x 100) を 100 で上限** = 過剰カバレッジは頭打ち）/ uint-ok・pct-ok（**no float**: 非負整数 / 0..100 整数）/ snapshot-judgment（domain 必須・count 群の不正拒否）/ dedup-take（同一 domain は alreadyExists） | **実装済み・実測** |
| 記述子 | `aiueos/coverage-rate.edn` | **実装済み** |
| parity | `kotoba/test/coverage/rate_parity_test.cljk` — 正本（registry.ts / types.ts）の率規則・整数規約・拒否名と一致 | **実装済み・実測** |

実測: `amu test aiueos/coverage_rate.cljk` → **21/21**（jvm-kir / js / wasm）。
parity → 9 assertions / 0 failures。

## 正本の正確な規則（guest はこれに追従）

- `ratePercent`: 「Integer-percent coverage rate, clamped 0-100 (over-coverage
  caps at 100)」。worldTotal ≤ 0 は 0（割り算しない）。
- **no float**: 「Counts are non-negative integers; coverage rate and existence
  probability are integer percent 0-100; any decimal is a string」。
  guest の uint-ok / pct-ok がこの閉じた形を判定。
- スナップショットは domain 必須（missingRequiredFields）、count 類は
  isUint（invalidCounts / invalid*Count）。同一 domain は alreadyExists
  （冪等 — snapshot rkey は domain 由来）。

## 未実装境界

- viewpointStat / latentEntity（E2E inner-type）の判定。
- 存在確率（existence probability）の計算。
- mon（DNA）化、aiueos session 載せ（fleet 共通）。
