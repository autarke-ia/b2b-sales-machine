#!/usr/bin/env python3
"""Validate the shipped specification and fixtures. No network or commercial API calls.

Requires: jsonschema, PyYAML. Optional: openapi-spec-validator.
This is not an integration test against an implemented backend.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

try:
    import yaml
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError as exc:
    raise SystemExit("Install dependencies: python -m pip install jsonschema PyYAML") from exc

ROOT = Path(__file__).resolve().parents[1]
counts: Counter[str] = Counter()
errors: list[str] = []


def check(condition: bool, label: str) -> None:
    counts["assertions"] += 1
    if not condition:
        errors.append(label)


def read_json(relative: str):
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


for file in ROOT.rglob("*.json"):
    try:
        json.loads(file.read_text(encoding="utf-8"))
        counts["json_files"] += 1
    except (OSError, ValueError) as exc:
        errors.append(f"{file.relative_to(ROOT)}: {exc}")

spec = read_json("contracts/openapi.json")
check(yaml.safe_load((ROOT / "contracts/openapi.yaml").read_text(encoding="utf-8")) == spec,
      "OpenAPI JSON and YAML differ")
check(spec.get("openapi") == "3.1.1", "Unexpected OpenAPI version")
schemas = spec["components"]["schemas"]


def local_ref(ref: str):
    check(ref.startswith("#/"), f"Non-local reference: {ref}")
    target = spec
    try:
        for part in ref[2:].split("/"):
            target = target[part.replace("~1", "/").replace("~0", "~")]
    except (KeyError, TypeError) as exc:
        errors.append(f"Unresolved reference {ref}: {exc}")
        return {}
    counts["references"] += 1
    return target


def walk(node):
    if isinstance(node, dict):
        if "$ref" in node:
            local_ref(node["$ref"])
        yield node
        for val in node.values():
            yield from walk(val)
    elif isinstance(node, list):
        for val in node:
            yield from walk(val)


all_nodes = list(walk(spec))
for name, schema in schemas.items():
    try:
        Draft202012Validator.check_schema(schema)
        counts["schemas"] += 1
    except Exception as exc:
        errors.append(f"Invalid JSON Schema {name}: {exc}")


def validate(value, schema, label: str) -> None:
    # 'components' lives at the schema root, allowing local OpenAPI component refs.
    wrapped = {"$schema": "https://json-schema.org/draft/2020-12/schema",
               "components": spec["components"], **schema}
    validator = Draft202012Validator(wrapped, format_checker=FormatChecker())
    for problem in validator.iter_errors(value):
        pointer = "/".join(str(x) for x in problem.absolute_path)
        errors.append(f"{label}/{pointer}: {problem.message}")
    counts["validated_instances"] += 1


def validate_named(value, schema_name: str, label: str) -> None:
    validate(value, {"$ref": f"#/components/schemas/{schema_name}"}, label)


# Validate examples embedded in request/response media objects, if present.
for node in all_nodes:
    if "schema" in node and isinstance(node["schema"], dict):
        if "example" in node:
            validate(node["example"], node["schema"], "inline example")
            counts["inline_examples"] += 1
        for name, example in node.get("examples", {}).items():
            if isinstance(example, dict) and "value" in example:
                validate(example["value"], node["schema"], "inline " + name)
                counts["inline_examples"] += 1

methods = {"get", "post", "patch", "put", "delete", "options", "head"}
ids: set[str] = set()
operation_index = []
for path, item in spec["paths"].items():
    for method, op in item.items():
        if method not in methods:
            continue
        operation_id = op.get("operationId")
        check(bool(operation_id) and operation_id not in ids, f"Duplicate/missing operationId: {path}")
        ids.add(operation_id)
        params = item.get("parameters", []) + op.get("parameters", [])
        actual = {x["name"] for x in params if x.get("in") == "path"}
        check(set(re.findall(r"\{([^}]+)\}", path)) == actual, f"Path parameters: {path}")
        check(all(x.get("required") is True for x in params if x.get("in") == "path"),
              f"Optional path parameter: {path}")
        check(len({(x["in"], x["name"]) for x in params}) == len(params), f"Duplicate params: {path}")
        if method in {"post", "patch", "put", "delete"} and not path.endswith("/auth/login"):
            check(any(x.get("name") == "X-CSRF-Token" and x.get("required") is True for x in params),
                  f"Missing mandatory CSRF: {method} {path}")
        if method == "post" and not path.endswith(("/auth/login", "/auth/logout")):
            check(any(x.get("name") == "Idempotency-Key" and x.get("required") is True for x in params),
                  f"Missing mandatory idempotency key: {path}")
        check(any(str(code).startswith("2") for code in op.get("responses", {})),
              f"Missing success response: {path}")
        operation_index.append((method.upper(), spec["servers"][0]["url"] + path, operation_id))
        counts["operations"] += 1
index = read_json("contracts/operations-index.json")
check(set(operation_index) == {(x["method"], x["path"], x["id"]) for x in index}, "Operation index differs")

fixture_map = {
    "company.json": "CompanyResponse", "signal.json": "SignalResponse",
    "contact.json": "ContactResponse", "opportunity.json": "OpportunityResponse",
    "login.json": "AuthSessionResponse", "error-conflict.json": "Error",
    "error-validation.json": "Error", "job-running.json": "JobResponse",
    "job-partial-failed.json": "JobResponse", "ruleset.json": "RulesetResponse",
    "import-preview.json": "ImportPreviewResponse", "schema.json": "SchemaCatalogResponse",
    "assessment.json": "AssessmentResponse", "company-detail.json": "CompanyDetailResponse",
    "company-detail-pending.json": "CompanyDetailResponse",
    "company-detail-out.json": "CompanyDetailResponse", "ranking.json": "RankingResponse",
    "ranking-empty.json": "RankingResponse", "suggestions.json": "SuggestionListResponse",
    "suggestions-fill.json": "SuggestionListResponse",
    "suggestions-contradiction.json": "SuggestionListResponse",
    "suggestions-inconclusive.json": "SuggestionListResponse",
}
for file, name in fixture_map.items():
    validate_named(read_json("examples/" + file), name, file)
    counts["response_fixtures"] += 1

rules = read_json("contracts/rules-default-v1.json")
validate_named(rules, "RuleConfig", "default rules")
check(sum(rules["icp"]["weights"].values()) == 100, "ICP weights != 100")
check(sum(rules["priority"]["weights"].values()) == 100, "Priority weights != 100")
check(rules["shared"]["employee_min"] <= rules["shared"]["employee_max"], "Employee range inverted")
check(rules["priority"]["medium_threshold"] < rules["priority"]["high_threshold"], "Bands inverted")
catalog = read_json("contracts/field-catalog.json")
validate_named(catalog, "SchemaCatalog", "field catalog")

seed = read_json("seed/normalized-demo.json")
validate_named(seed["dataset"], "Dataset", "demo dataset")
dataset_id = seed["dataset"]["id"]
company_ids = {x["id"] for x in seed["companies"]}
for collection, typename in [("companies", "Company"), ("signals", "Signal"),
                             ("contacts", "Contact"), ("opportunities", "Opportunity")]:
    records = seed[collection]
    check(len({x["id"] for x in records}) == len(records), f"Duplicate ID in {collection}")
    check(len({x["external_id"] for x in records}) == len(records), f"Duplicate external_id in {collection}")
    for row in records:
        validate_named(row, typename, f"seed/{collection}/{row['external_id']}")
        check(row["dataset_id"] == dataset_id, f"Wrong dataset in {collection}")
        if collection != "companies":
            check(row["company_id"] in company_ids, f"Orphan company in {collection}")
        counts["seed_records"] += 1
check(hashlib.sha256((ROOT / "seed/allya-case-original.xlsx").read_bytes()).hexdigest() ==
      seed["source_file_sha256"], "Original XLSX hash mismatch")
for expected in read_json("seed/expected-assessments-v1.json"):
    validate_named(expected["gate"], "Gate", "golden gate " + expected["external_id"])
    if expected["priority"] is not None:
        validate_named(expected["priority"], "Priority", "golden priority " + expected["external_id"])
    counts["golden_profiles"] += 1

# Upload templates: read with csv, check stable headers and canonical field names.
for collection, entity in [("companies", "company"), ("signals", "signal"),
                           ("contacts", "contact"), ("opportunities", "opportunity")]:
    with (ROOT / f"templates/{collection}.csv").open(encoding="utf-8-sig", newline="") as stream:
        headers = next(csv.reader(stream))
    check(len(set(headers)) == len(headers), f"Duplicate CSV header: {collection}")
    valid = {x["key"] for x in catalog["entities"][entity]}
    valid.add("company_external_id")
    check(set(headers).issubset(valid), f"Unknown CSV headers {collection}: {set(headers) - valid}")
    check("external_id" in headers, f"Missing external_id: {collection}")
    counts["csv_templates"] += 1

# Rule templates are executable configuration data, not presentation-only CSVs.
for target, group in [("icp_rules", "icp"), ("priority_rules", "priority")]:
    with (ROOT / f"templates/{target}.csv").open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    check({r["criterion_id"]: float(r["weight"]) for r in rows} == rules[group]["weights"],
          f"Rule CSV differs from defaults: {target}")
    counts["csv_templates"] += 1
with (ROOT / "templates/disqualifiers.csv").open(encoding="utf-8-sig", newline="") as stream:
    disqualifier_rows = list(csv.DictReader(stream))
check({r["rule_id"] for r in disqualifier_rows} == {"D01", "D02", "D03", "D04", "D05"},
      "Disqualifier CSV IDs differ")
for row in disqualifier_rows:
    rule = rules["disqualifiers"][row["rule_id"]]
    enabled = rule.get("enabled", rule.get("professional_public_only"))
    check((row["enabled"] == "true") == enabled, "Disqualifier enable differs")
    for field in ["min_employees", "penalty_points"]:
        if row[field]:
            check(float(row[field]) == rule.get(field), "Disqualifier parameter differs")
counts["csv_templates"] += 1

# Resolve relative Markdown links. Inline pseudo-JSON/code is not interpreted as a link.
for md in ROOT.rglob("*.md"):
    for href in re.findall(r"\[[^\]]+\]\(([^)]+)\)", md.read_text(encoding="utf-8")):
        if re.match(r"^[a-zA-Z]+:", href) or href.startswith("#"):
            continue
        target = unquote(href.split("#", 1)[0])
        if target:
            check((md.parent / target).exists(), f"Broken link {md.relative_to(ROOT)}: {target}")
            counts["local_links"] += 1

# Optional independent OpenAPI validator: its absence is reported, never called success.
try:
    from openapi_spec_validator import validate as validate_openapi
except ImportError:
    openapi_status = "NOT RUN: optional openapi-spec-validator is not installed"
else:
    try:
        validate_openapi(spec)
        openapi_status = "PASS: independent OpenAPI validator"
    except Exception as exc:
        errors.append(f"OpenAPI validator: {exc}")
        openapi_status = "FAIL"

print(json.dumps({"checks": dict(counts), "independent_openapi_validator": openapi_status,
                  "errors": errors, "ok": not errors}, ensure_ascii=False, indent=2))
sys.exit(1 if errors else 0)
