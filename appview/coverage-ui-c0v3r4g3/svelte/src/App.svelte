<script lang="ts">
  import { onMount } from "svelte";

  type PriorityRow = {
    domain: string;
    collected: number;
    worldTotal: number;
    coverageRate: number;
    remaining: number;
  };

  type Report = {
    evaluatedAt: string;
    summary: {
      domains: number;
      nonzeroDomains: number;
      zeroDomains: number;
      fullOrOverDomains: number;
      sumCollected: number;
      sumWorldTotal: number;
      sumDidCount: number;
      sumRecordCount: number;
      sumVertexCount: number;
      overallCoverageRate: number;
    };
    priorities: {
      zeroCoverage: PriorityRow[];
      strategicBacklog: PriorityRow[];
      nearWins: PriorityRow[];
      smallestCoverage: PriorityRow[];
      denominatorAlerts: PriorityRow[];
    };
  };

  type TestCoverageEntry = {
    language: string;
    directory: string;
    test_count: number;
    pass_count: number;
    fail_count: number;
    skip_count: number;
    line_coverage_pct: number;
    available: boolean;
    duration: string;
    error?: string;
  };

  type TestCoverageReport = {
    evaluated_at: string;
    overall_tests: number;
    overall_pass: number;
    overall_fail: number;
    overall_skip: number;
    overall_line_coverage_pct: number;
    entries: TestCoverageEntry[];
  };

  type BpmnCoverageRow = {
    area: string;
    project: string;
    proc: string;
    sourcePath: string;
    bpmnProcessId: string;
    nsid: string;
    lexiconPath: string;
    checks: Record<string, boolean>;
  };

  type BpmnCoverageReport = {
    generated_at: string;
    ok: boolean;
    count: number;
    summary: Record<string, number>;
    rows: BpmnCoverageRow[];
    errors: string[];
    loop_schedule?: {
      workflow: string;
      cron: string;
      site_path: string;
    };
  };

  let report: Report | null = null;
  let testCoverage: TestCoverageReport | null = null;
  let bpmnCoverage: BpmnCoverageReport | null = null;
  let worldError = "";
  let loading = true;

  function formatInt(value: number): string {
    return new Intl.NumberFormat("en-US").format(Math.round(value));
  }

  function formatPercent(value: number): string {
    if (value >= 0.01) return `${(value * 100).toFixed(2)}%`;
    if (value >= 0.000001) return `${(value * 100).toFixed(4)}%`;
    return `${(value * 100).toExponential(2)}%`;
  }

  function coverageTone(rate: number): "low" | "mid" | "high" {
    if (rate < 0.2) return "low";
    if (rate < 0.6) return "mid";
    return "high";
  }

  function bpmnAreaRows(): Array<{ area: string; count: number }> {
    if (!bpmnCoverage) return [];
    return Object.entries(bpmnCoverage.summary)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
  }

  function recommendationTitle(): string {
    if (!report) return "";
    if (report.priorities.zeroCoverage.length > 0) {
      return `${report.priorities.zeroCoverage.length} domains are at 0%. Start with bootstrap ingestion there.`;
    }
    return "No zero-coverage domains. Shift effort into near-wins and denominator hygiene.";
  }

  async function tryParseJson<T>(resp: Response): Promise<T | null> {
    const ct = resp.headers.get("content-type") ?? "";
    if (!resp.ok || !ct.includes("json")) return null;
    try { return await resp.json() as T; } catch { return null; }
  }

  onMount(async () => {
    try {
      const [worldResp, testCovResp, bpmnCovResp] = await Promise.all([
        fetch("/xrpc/com.etzhayyim.apps.coverage.getWorldCoverage"),
        fetch("/test-coverage/latest.json"),
        fetch("/bpmn-coverage/latest.json"),
      ]);

      const worldData = await worldResp.json();
      if (!worldResp.ok) throw new Error(worldData?.error ?? `HTTP ${worldResp.status}`);
      report = worldData as Report;

      testCoverage = await tryParseJson<TestCoverageReport>(testCovResp);
      bpmnCoverage = await tryParseJson<BpmnCoverageReport>(bpmnCovResp);
    } catch (e) {
      worldError = e instanceof Error ? e.message : "failed to load coverage";
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <main class="shell state"><p>Loading world coverage...</p></main>
{:else if worldError}
  <main class="shell state"><p class="error">{worldError}</p></main>
{:else if report}
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">coverage.etzhayyim.com</p>
      <h1>Coverage Control Room</h1>
      <p class="lede">Live world coverage from <code>mv_world_coverage_live</code> with test snapshot overlay.</p>
      <div class="kpis">
        <article class={`kpi ${coverageTone(report.summary.overallCoverageRate)}`}>
          <span>World coverage</span>
          <strong>{formatPercent(report.summary.overallCoverageRate)}</strong>
        </article>
        <article class="kpi">
          <span>Domains tracked</span>
          <strong>{formatInt(report.summary.domains)}</strong>
        </article>
        <article class="kpi">
          <span>Zero domains</span>
          <strong>{formatInt(report.summary.zeroDomains)}</strong>
        </article>
        <article class="kpi">
          <span>Collected / total</span>
          <strong>{formatInt(report.summary.sumCollected)} / {formatInt(report.summary.sumWorldTotal)}</strong>
        </article>
      </div>
    </section>

    <section class="panel">
      <h2>Action Focus</h2>
      <p>{recommendationTitle()}</p>
      <div class="focus-grid">
        <article>
          <h3>Zero Coverage</h3>
          <p>Fastest route to baseline visibility. Start with smallest denominator and highest dependency impact.</p>
        </article>
        <article>
          <h3>Near Wins</h3>
          <p>Convert domains above 40% into public proof points with short runway execution.</p>
        </article>
        <article>
          <h3>Denominator Alerts</h3>
          <p>Over-100% rows indicate denominator drift. Fix denominator before adding ingest.</p>
        </article>
      </div>
    </section>

    {#if testCoverage}
      <section class="panel">
        <h2>Test Coverage Snapshot</h2>
        <p>Published from <code>/test-coverage/latest.json</code>.</p>
        <div class="kpis compact">
          <article class={`kpi ${coverageTone(testCoverage.overall_line_coverage_pct / 100)}`}>
            <span>Line coverage</span>
            <strong>{formatPercent(testCoverage.overall_line_coverage_pct / 100)}</strong>
          </article>
          <article class="kpi">
            <span>Total tests</span>
            <strong>{formatInt(testCoverage.overall_tests)}</strong>
          </article>
          <article class="kpi">
            <span>Pass / fail</span>
            <strong>{formatInt(testCoverage.overall_pass)} / {formatInt(testCoverage.overall_fail)}</strong>
          </article>
          <article class="kpi">
            <span>Skip</span>
            <strong>{formatInt(testCoverage.overall_skip)}</strong>
          </article>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lang</th>
                <th>Directory</th>
                <th>Coverage</th>
                <th>Tests</th>
                <th>P/F/S</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each testCoverage.entries as entry}
                <tr>
                  <td>{entry.language}</td>
                  <td>{entry.directory || "-"}</td>
                  <td>{entry.available ? formatPercent(entry.line_coverage_pct / 100) : "-"}</td>
                  <td>{formatInt(entry.test_count)}</td>
                  <td>{formatInt(entry.pass_count)} / {formatInt(entry.fail_count)} / {formatInt(entry.skip_count)}</td>
                  <td>{entry.error ?? "ok"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if bpmnCoverage}
      <section class="panel">
        <h2>BPMN Actor Coverage Loop</h2>
        <p>Published from <code>/bpmn-coverage/latest.json</code> on the coverage-site schedule.</p>
        <div class="kpis compact">
          <article class={`kpi ${bpmnCoverage.ok ? "high" : "low"}`}>
            <span>Registry gate</span>
            <strong>{bpmnCoverage.ok ? "ok" : "gaps"}</strong>
          </article>
          <article class="kpi">
            <span>BPMN bindings</span>
            <strong>{formatInt(bpmnCoverage.count)}</strong>
          </article>
          <article class="kpi">
            <span>Areas covered</span>
            <strong>{formatInt(Object.keys(bpmnCoverage.summary).length)}</strong>
          </article>
          <article class="kpi">
            <span>Loop schedule</span>
            <strong>{bpmnCoverage.loop_schedule?.cron ?? "-"}</strong>
          </article>
        </div>
        <div class="focus-grid">
          {#each bpmnAreaRows() as row}
            <article>
              <h3>{row.area}</h3>
              <p>{formatInt(row.count)} covered BPMN actor bindings.</p>
            </article>
          {/each}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Project</th>
                <th>Process</th>
                <th>NSID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each bpmnCoverage.rows as row}
                <tr>
                  <td>{row.area}</td>
                  <td>{row.project}</td>
                  <td>{row.bpmnProcessId}</td>
                  <td>{row.nsid}</td>
                  <td>{Object.values(row.checks).every(Boolean) ? "ok" : "gap"}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <section class="tables">
      <article class="panel">
        <h2>Zero Coverage</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>World total</th><th>Collected</th></tr></thead>
            <tbody>
              {#each report.priorities.zeroCoverage as row}
                <tr><td>{row.domain}</td><td>{formatInt(row.worldTotal)}</td><td>{formatInt(row.collected)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel">
        <h2>Near Wins</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>Coverage</th><th>Remaining</th></tr></thead>
            <tbody>
              {#each report.priorities.nearWins as row}
                <tr><td>{row.domain}</td><td>{formatPercent(row.coverageRate)}</td><td>{formatInt(row.remaining)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel wide">
        <h2>Strategic Backlog</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>Coverage</th><th>Remaining</th><th>Collected</th></tr></thead>
            <tbody>
              {#each report.priorities.strategicBacklog as row}
                <tr>
                  <td>{row.domain}</td>
                  <td>{formatPercent(row.coverageRate)}</td>
                  <td>{formatInt(row.remaining)}</td>
                  <td>{formatInt(row.collected)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </article>

      <article class="panel wide">
        <h2>Denominator Alerts</h2>
        <p>Rows above 100% are denominator incidents, not ingest deficits.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Domain</th><th>Coverage</th><th>Collected</th><th>World total</th></tr></thead>
            <tbody>
              {#each report.priorities.denominatorAlerts as row}
                <tr>
                  <td>{row.domain}</td>
                  <td>{formatPercent(row.coverageRate)}</td>
                  <td>{formatInt(row.collected)}</td>
                  <td>{formatInt(row.worldTotal)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </article>
    </section>

    <footer class="foot">
      World evaluated: {new Date(report.evaluatedAt).toLocaleString("ja-JP", { hour12: false })}
      {#if testCoverage}
        | Test evaluated: {new Date(testCoverage.evaluated_at).toLocaleString("ja-JP", { hour12: false })}
      {/if}
      {#if bpmnCoverage}
        | BPMN generated: {new Date(bpmnCoverage.generated_at).toLocaleString("ja-JP", { hour12: false })}
      {/if}
    </footer>
  </main>
{/if}

<style>
  :global(body) {
    margin: 0;
    color: #1e2626;
    font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
    background:
      radial-gradient(circle at 18% 0%, rgba(60, 156, 127, 0.22), transparent 34%),
      radial-gradient(circle at 90% 10%, rgba(238, 174, 71, 0.18), transparent 30%),
      linear-gradient(180deg, #f5f6f0 0%, #e6ecdf 100%);
  }

  h1, h2, h3, p {
    margin: 0;
  }

  .shell {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 16px 52px;
  }

  .state {
    min-height: 30vh;
    display: grid;
    place-items: center;
  }

  .hero,
  .panel {
    border-radius: 20px;
    border: 1px solid rgba(30, 38, 38, 0.1);
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(6px);
  }

  .hero {
    padding: 24px;
    box-shadow: 0 18px 36px rgba(40, 50, 45, 0.12);
  }

  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #167065;
    margin-bottom: 8px;
  }

  h1 {
    font-size: clamp(2rem, 5vw, 3.8rem);
    line-height: 0.95;
    margin-bottom: 10px;
    font-family: "Baskerville", "Times New Roman", serif;
  }

  .lede {
    color: #4e5b5b;
    margin-bottom: 20px;
  }

  .kpis {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }

  .kpi {
    border-radius: 16px;
    padding: 14px;
    border: 1px solid rgba(30, 38, 38, 0.09);
    background: rgba(255, 255, 255, 0.86);
  }

  .kpi.low {
    border-color: rgba(175, 73, 60, 0.45);
    background: rgba(251, 235, 232, 0.86);
  }

  .kpi.mid {
    border-color: rgba(195, 128, 30, 0.45);
    background: rgba(250, 241, 224, 0.86);
  }

  .kpi.high {
    border-color: rgba(43, 130, 83, 0.45);
    background: rgba(230, 246, 236, 0.86);
  }

  .kpi span {
    display: block;
    font-size: 12px;
    color: #556060;
    margin-bottom: 8px;
  }

  .kpi strong {
    font-size: 1.25rem;
    line-height: 1.25;
  }

  .panel {
    margin-top: 14px;
    padding: 18px;
  }

  h2 {
    font-size: 1.35rem;
    margin-bottom: 8px;
  }

  .panel > p {
    color: #4d5959;
  }

  .focus-grid {
    margin-top: 14px;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  }

  .focus-grid article {
    border-radius: 14px;
    padding: 14px;
    border: 1px solid rgba(30, 38, 38, 0.09);
    background: rgba(247, 251, 246, 0.85);
  }

  .focus-grid h3 {
    margin-bottom: 8px;
    font-size: 1rem;
  }

  .tables {
    margin-top: 14px;
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .wide {
    grid-column: 1 / -1;
  }

  .table-wrap {
    margin-top: 10px;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
    min-width: 640px;
  }

  th, td {
    text-align: left;
    vertical-align: top;
    padding: 9px 8px;
    border-bottom: 1px solid rgba(30, 38, 38, 0.08);
  }

  th {
    font-size: 0.74rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5f6868;
  }

  tr:hover td {
    background: rgba(226, 239, 231, 0.44);
  }

  .foot,
  .error {
    margin-top: 18px;
    color: #4c5858;
  }

  code {
    font-family: "SFMono-Regular", ui-monospace, monospace;
    font-size: 0.9em;
  }

  @media (max-width: 840px) {
    .tables {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
    .panel {
      padding: 14px;
    }
  }
</style>
