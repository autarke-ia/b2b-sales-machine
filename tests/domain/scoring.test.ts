/**
 * Suíte do motor de scoring — portada 1:1 de tests/scoring.test.mjs (pacote v1.0.0, 52 testes).
 * Os casos e valores são os do pacote; divergência entre esta suíte e o pacote corrige o pacote.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluate, rankRows, type Assessment, type RankableRow, type ScoringInput } from "../../src/domain/scoring";

const read = (p: string): unknown => JSON.parse(fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8"));
const base = read("examples/scoring-input.json") as ScoringInput;
const fresh = (): ScoringInput => {
  const x = structuredClone(base);
  x.company.employer_branding = "high";
  x.review_completed = true;
  x.pending_suggestions = 0;
  return x;
};
const run = (modify?: (x: ScoringInput) => void): Assessment => {
  const x = fresh();
  modify?.(x);
  return evaluate(x);
};
const prio = (r: Assessment) => {
  if (!r.priority) throw new Error("prioridade inexistente — empresa não está 'in'");
  return r.priority;
};

test("Full profile scores 100 in both independent stages", () => { const r = run(); assert.equal(r.gate.state, "in"); assert.equal(r.gate.score_min, 100); assert.equal(prio(r).score, 100); });
test("ICP benefits change gate but do not get added to priority", () => { const r = run((x) => (x.company.has_benefits = false)); assert.equal(r.gate.score_min, 88); assert.equal(prio(r).score, 100); });
test("79 employees fails D01", () => { const r = run((x) => (x.company.employees = 79)); assert.equal(r.gate.state, "out"); assert.ok(r.gate.hard_failures.includes("D01")); assert.equal(r.priority, null); });
test("80 employees does not fail D01 but loses size points", () => { const r = run((x) => (x.company.employees = 80)); assert.equal(r.gate.state, "in"); assert.equal(prio(r).score, 80); });
test("199 versus 200 employee boundary is inclusive", () => { assert.equal(prio(run((x) => (x.company.employees = 199))).score, 80); assert.equal(prio(run((x) => (x.company.employees = 200))).score, 100); });
test("5000 versus 5001 upper boundary is inclusive", () => { assert.equal(prio(run((x) => (x.company.employees = 5000))).score, 100); assert.equal(prio(run((x) => (x.company.employees = 5001))).score, 80); });
test("Missing employees leaves hard requirement pending", () => { const r = run((x) => (x.company.employees = null)); assert.equal(r.gate.state, "pending"); assert.equal(r.gate.in_icp, null); assert.equal(r.priority, null); });
test("Unknown Brazil operation blocks a definitive approval", () => { assert.equal(run((x) => (x.company.operates_in_brazil = null)).gate.state, "pending"); });
test("No Brazil operation rejects the company", () => { assert.ok(run((x) => (x.company.operates_in_brazil = false)).gate.hard_failures.includes("D02")); });
test("Inactive company rejects independently of score", () => { assert.ok(run((x) => (x.company.operating_status = "inactive")).gate.hard_failures.includes("D04")); });
test("Unknown operating status remains pending", () => { assert.equal(run((x) => (x.company.operating_status = "unknown")).gate.state, "pending"); });
test("Missing benefits does not block a mathematically safe gate", () => { const r = run((x) => { x.company.has_benefits = null; x.company.seeks_benefit_differentiation = null; }); assert.equal(r.gate.score_min, 88); assert.equal(r.gate.score_max, 100); assert.equal(r.gate.state, "in"); });
test("A known false conjunct resolves benefits to zero", () => { const r = run((x) => { x.company.has_benefits = false; x.company.seeks_benefit_differentiation = null; }); assert.equal(r.gate.criteria.find((c) => c.id === "benefits")?.factor, 0); });
test("Uncertainty straddling cutoff produces pending", () => { const r = run((x) => Object.assign(x.company, { has_benefits: null, seeks_benefit_differentiation: null, multi_region: false, employer_branding: "low", retention_pain: "low", renewal_window: "over_12" })); assert.equal(r.gate.score_min, 52); assert.equal(r.gate.score_max, 64); assert.equal(r.gate.state, "pending"); });
test("Maximum below cutoff rejects without imputing data", () => { const r = run((x) => Object.assign(x.company, { has_benefits: false, multi_region: false, employer_branding: "low", retention_pain: "low", renewal_window: "over_12" })); assert.equal(r.gate.score_max, 52); assert.equal(r.gate.state, "out"); });
test("Exactly 60 known points qualifies", () => { const r = run((x) => Object.assign(x.company, { has_benefits: false, multi_region: false, employer_branding: "low", renewal_window: "over_12" })); assert.equal(r.gate.score_min, 60); assert.equal(r.gate.state, "in"); });
test("Upper bound exactly 60 and lower 48 stays pending", () => { const r = run((x) => Object.assign(x.company, { has_benefits: null, seeks_benefit_differentiation: null, hr_structured: false, employer_branding: "low", retention_pain: "low", renewal_window: "over_12" })); assert.equal(r.gate.score_min, 48); assert.equal(r.gate.score_max, 60); assert.equal(r.gate.state, "pending"); });
test("Known weights are not renormalized", () => { const r = run((x) => Object.assign(x.company, { has_benefits: null, seeks_benefit_differentiation: null, hr_structured: null, multi_region: null, growth: null, employer_branding: null, retention_pain: null, renewal_window: null, uf: null })); assert.equal(r.gate.score_min, 20); assert.equal(r.gate.state, "pending"); });
test("Private/blocked contact affects S09, not company eligibility", () => { const r = run((x) => (x.contacts![0].is_professional_public = false)); assert.equal(r.gate.state, "in"); assert.equal(prio(r).score, 95); });
test("A channel without a named person does not identify a decision maker", () => { assert.equal(prio(run((x) => (x.contacts![0].full_name = null))).score, 95); });
test("Signal exactly 90 days old qualifies", () => { assert.equal(prio(run((x) => (x.signals![0].observed_on = "2026-07-02"))).score, 100); });
test("Signal 91 days old does not qualify", () => { assert.equal(prio(run((x) => (x.signals![0].observed_on = "2026-07-01"))).score, 90); });
test("Future signal does not qualify", () => { assert.equal(prio(run((x) => (x.signals![0].observed_on = "2026-10-01"))).score, 90); });
test("Undated signal does not qualify for recency", () => { assert.equal(prio(run((x) => (x.signals![0].observed_on = null))).score, 90); });
test("Medium-strength signal does not qualify as strong", () => { assert.equal(prio(run((x) => (x.signals![0].strength = "medium"))).score, 90); });
test("Several qualifying signals do not stack S08 points", () => { const r = run((x) => x.signals!.push({ ...x.signals![0], id: "035ee5bd-382f-44e6-91c2-e460872c6a0b" })); assert.equal(prio(r).score, 100); });
test("Disallowed signal is not used", () => { assert.equal(prio(run((x) => (x.signals![0].source_allowed = false))).score, 90); });
test("Archived signal is not used", () => { assert.equal(prio(run((x) => (x.signals![0].archived_at = "2026-09-29T00:00:00Z"))).score, 90); });
test("History absent makes S10 unknown rather than known zero", () => { const r = run((x) => (x.opportunities = [])); assert.equal(prio(r).score, 95); assert.equal(prio(r).score_max, 100); assert.equal(prio(r).known_weight, 95); assert.equal(prio(r).status, "preliminary"); });
test("Company own outcomes cannot become S10 evidence", () => { const r = run((x) => (x.opportunities![0].company_id = x.company.id)); assert.equal(prio(r).score, 95); assert.equal(prio(r).criteria.find((c) => c.id === "S10")?.factor, null); });
test("Future historical win cannot count", () => { assert.equal(prio(run((x) => (x.opportunities![0].closed_on = "2026-10-01"))).score, 95); });
test("Historical row without closing date cannot count", () => { assert.equal(prio(run((x) => (x.opportunities![0].closed_on = null))).score, 95); });
test("Known dated loss is known zero, not missing history", () => { const r = run((x) => (x.opportunities![0].result = "lost")); assert.equal(prio(r).score, 95); assert.equal(prio(r).known_weight, 100); assert.equal(prio(r).status, "reviewed"); });
test("D05 confirmed subtracts configured penalty", () => { const r = run((x) => (x.company.renewed_24_plus = true)); assert.equal(prio(r).score, 80); assert.equal(prio(r).applied_penalty, 20); });
test("D05 unknown is not silently applied", () => { const r = run((x) => (x.company.renewed_24_plus = null)); assert.equal(prio(r).score, 100); assert.equal(prio(r).score_min, 80); assert.equal(prio(r).score_max, 100); assert.equal(prio(r).applied_penalty, 0); });
test("Over-12 renewal is not evidence of a 24-plus renewal", () => { const r = run((x) => { x.company.renewal_window = "over_12"; x.company.renewed_24_plus = null; }); assert.equal(prio(r).score, 92); assert.equal(prio(r).applied_penalty, 0); });
test("Penalty result is clamped at zero", () => { const r = run((x) => { x.company.renewed_24_plus = true; x.rules.disqualifiers.D05.penalty_points = 100; x.signals = []; }); assert.equal(prio(r).score, 0); });
test("Human review incomplete marks score preliminary", () => { assert.equal(prio(run((x) => (x.review_completed = false))).status, "preliminary"); });
test("Pending actionable suggestions mark score preliminary", () => { assert.equal(prio(run((x) => (x.pending_suggestions = 1))).status, "preliminary"); });
test("Fully known and reviewed result is marked reviewed", () => { assert.equal(prio(run()).status, "reviewed"); });
test("Archived company has no priority", () => { const r = run((x) => (x.company.archived_at = "2026-09-29T00:00:00Z")); assert.equal(r.gate.state, "out"); assert.equal(r.priority, null); });
test("Required partial criterion fails eligibility", () => { const r = run((x) => { x.rules.icp.required_criteria = ["growth"]; x.company.growth = "medium"; }); assert.equal(r.gate.state, "out"); });
test("Required unknown criterion stays pending", () => { const r = run((x) => { x.rules.icp.required_criteria = ["benefits"]; x.company.has_benefits = null; }); assert.equal(r.gate.state, "pending"); });
test("Disabling D01 does not invent size points", () => { const r = run((x) => { x.rules.disqualifiers.D01.enabled = false; x.company.employees = 65; }); assert.equal(r.gate.state, "in"); assert.equal(prio(r).score, 80); });
test("Weights not summing to 100 fail early", () => { assert.throws(() => run((x) => (x.rules.icp.weights.size = 19)), /RULE_WEIGHTS_MUST_SUM_100/); });
test("Invalid employee range fails early", () => { assert.throws(() => run((x) => (x.rules.shared.employee_min = 6000)), /INVALID_EMPLOYEE_RANGE/); });
test("D03 cannot be disabled", () => { assert.throws(() => run((x) => (x.rules.disqualifiers.D03.professional_public_only = false)), /D03_CANNOT_BE_DISABLED/); });
test("Ranking excludes out and resolves equal scores by external ID", () => { const a = run(), b = run(); const rows: RankableRow[] = [{ external_id: "B", assessment: b }, { external_id: "A", assessment: a }, { external_id: "C", assessment: run((x) => (x.company.employees = 10)) }]; assert.deepEqual(rankRows(rows).map((x) => x.external_id), ["A", "B"]); });
test("Raw precision wins before display rounding", () => { const mk = (id: string, w: number): RankableRow => ({ external_id: id, assessment: { gate: { state: "in" }, priority: { score: 0.01, known_weight: 100, applied_penalty: 0, criteria: [{ weight: w, factor: 0.01 }] } } }); assert.deepEqual(rankRows([mk("A", 1.01), mk("B", 1.02)]).map((x) => x.external_id), ["B", "A"]); });
test("Original normalized case matches versioned golden results", () => {
  const seed = read("seed/normalized-demo.json") as { dataset: { default_as_of: string }; companies: ScoringInput["company"][]; signals: NonNullable<ScoringInput["signals"]>; contacts: NonNullable<ScoringInput["contacts"]>; opportunities: NonNullable<ScoringInput["opportunities"]> };
  const rules = read("contracts/rules-default-v1.json") as ScoringInput["rules"];
  const expected = read("seed/expected-assessments-v1.json") as unknown;
  const actual = seed.companies.map((company) => ({ external_id: (company as { external_id: string }).external_id, ...evaluate({ company, signals: seed.signals, contacts: seed.contacts, opportunities: seed.opportunities, rules, as_of: seed.dataset.default_as_of }) }));
  assert.deepEqual(actual, expected);
  const counts = actual.reduce<Record<string, number>>((o, x) => ((o[x.gate.state] = (o[x.gate.state] ?? 0) + 1), o), {});
  assert.deepEqual(counts, { out: 37, in: 56, pending: 27 });
});
test("Deterministic property checks over 500 profiles", () => {
  let seed = 412323;
  const rnd = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 500; i++) {
    const x = fresh();
    x.company.employees = pick([null, 0, 79, 80, 199, 200, 5000, 5001]);
    for (const k of ["hr_structured", "has_benefits", "seeks_benefit_differentiation", "multi_region", "operates_in_brazil", "renewed_24_plus"] as const) x.company[k] = pick([null, false, true]);
    for (const k of ["growth", "employer_branding", "retention_pain"] as const) x.company[k] = pick([null, "low", "medium", "high"]);
    const r = evaluate(x);
    assert.ok(r.gate.score_min <= r.gate.score_max);
    assert.ok(r.gate.score_max <= 100);
    if (r.gate.state !== "in") assert.equal(r.priority, null);
    else { assert.ok(prio(r).score_min <= prio(r).score); assert.ok(prio(r).score <= prio(r).score_max); assert.ok(prio(r).score_max <= 100); }
  }
});
test("Half-up presentation rounds a 10.075 product to 10.08", () => {
  const r = run((x) => {
    Object.keys(x.rules.priority.weights).forEach((k) => (x.rules.priority.weights[k] = 0));
    x.rules.priority.weights.S01 = 79.85;
    x.rules.priority.weights.S04 = 20.15;
    x.company.employees = 80;
    x.company.growth = "medium";
  });
  assert.equal(r.gate.state, "in");
  assert.equal(prio(r).score, 10.08);
  assert.equal(prio(r).criteria.find((c) => c.id === "S04")?.points, 10.08);
});
