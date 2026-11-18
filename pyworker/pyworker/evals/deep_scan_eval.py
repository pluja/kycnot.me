"""Score deep scan output against hand-checked answers, to compare models and prompt versions.

    python -m pyworker.evals.deep_scan_eval run --models a,b --repeat 2 --out local_data/deep_scan_eval/runs/x
    python -m pyworker.evals.deep_scan_eval score local_data/deep_scan_eval/runs/x

`run` sends the frozen cases (scripts/freeze_deep_scan_cases.py) to each model
and stores every reply, so `score` can be rerun as the answers are refined
without paying for the calls again. Replies go through the same filters the
worker applies before a reviewer sees them, so what is scored is what would
reach the review queue.

A model is named as `id` or `id@effort`, the effort being passed as reasoning_effort.
"""

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from openai import OpenAI

from pyworker.tasks.deep_scan import DeepScanTask, _format_attribute_catalog
from pyworker.utils import schemas
from pyworker.utils.ai import (
    _PROMPTS_DIR,
    build_deep_scan_prompt,
    deep_scan_messages,
    parse_json_reply,
)

GOLD_PATH = Path(__file__).with_name("deep_scan_gold.json")
DEFAULT_CASES = Path("local_data/deep_scan_eval/cases.json")
SHINGLE_WORDS = 6
RATINGS = ("negative", "neutral", "positive")
LISTING_VALUE_MAX_CHARS = 100
HIGHLIGHTS_ASKED_FOR = 6


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def call_file(out_dir: Path, model: str, slug: str, repeat: int) -> Path:
    return out_dir / f"{re.sub(r'[^A-Za-z0-9.@-]+', '_', model)}__{slug}__{repeat}.json"


def call_model(client: OpenAI, model: str, messages: list) -> dict:
    model_id, _, effort = model.partition("@")
    started = time.monotonic()
    completion = client.chat.completions.create(
        model=model_id,
        messages=messages,
        **({"reasoning_effort": effort} if effort else {}),
    )
    extra = completion.model_extra or {}
    return {
        "seconds": round(time.monotonic() - started, 1),
        "cost": (extra.get("x_nanogpt_pricing") or {}).get("cost"),
        "usage": completion.usage.model_dump() if completion.usage else None,
        "content": completion.choices[0].message.content or "",
    }


def run_one(
    client: OpenAI, system_prompt: str, catalog_md: str, case: dict, model: str
) -> dict:
    messages = deep_scan_messages(
        content=case["corpus"],
        service_name=case["service"]["name"],
        attribute_catalog_md=catalog_md,
        current_attribute_ids=case["currentAttributeIds"],
        listing_record=case["listingRecord"],
        current_kyc_notes=case["service"].get("kycPolicyMd") or "",
        system_prompt=system_prompt,
    )
    try:
        reply = call_model(client, model, messages)
    except Exception as error:
        return {"error": f"call failed: {error}"}
    try:
        parsed = parse_json_reply(reply["content"])
        schemas.DEEP_SCAN.validate(parsed)
        reply["result"] = parsed
    except Exception as error:
        reply["error"] = f"invalid reply: {error}"
    return reply


def run(args: argparse.Namespace) -> None:
    frozen = load_cases(args.cases)
    catalog_md = _format_attribute_catalog(frozen["catalog"])
    system_prompt = build_deep_scan_prompt(
        Path(args.prompts) if args.prompts else _PROMPTS_DIR
    )
    slugs = args.slugs.split(",") if args.slugs else sorted(frozen["cases"])
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "system_prompt.md").write_text(system_prompt)
    client = OpenAI(timeout=900, max_retries=2)

    jobs = [
        (model, slug, repeat)
        for model in args.models.split(",")
        for slug in slugs
        for repeat in range(args.repeat)
        if not call_file(out_dir, model, slug, repeat).exists()
    ]
    print(f"{len(jobs)} calls to make")

    def work(job: tuple[str, str, int]) -> None:
        model, slug, repeat = job
        reply = run_one(client, system_prompt, catalog_md, frozen["cases"][slug], model)
        call_file(out_dir, model, slug, repeat).write_text(
            json.dumps({"model": model, "slug": slug, "repeat": repeat, **reply})
        )
        print(
            f"{model} {slug} #{repeat}: {reply.get('error') or 'ok'} ${reply.get('cost') or 0:.4f}"
        )

    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        list(pool.map(work, jobs))


def as_reviewed(
    task: DeepScanTask, case: dict, catalog_ids: set[int], result: dict
) -> dict:
    """The proposal as the worker would store it, after its own filters."""
    pages = [
        SimpleNamespace(
            url=page["url"], url_key=page["urlKey"], markdown=page["markdown"]
        )
        for page in case["pages"]
    ]
    raw_highlights = len(result.get("highlights") or [])
    task.keep_supported_highlights(result, SimpleNamespace(pages=pages))
    proposed = task._build_proposed_edits(
        result=result,
        corpus_hash="eval",
        current_attribute_ids=case["currentAttributeIds"],
        catalog_ids=catalog_ids,
        service_id=case["service"]["id"],
        listing_record=case["listingRecord"],
        declined=set(),
        current_kyc_level=case["service"]["kycLevel"],
        current_kyc_notes=case["service"].get("kycPolicyMd") or "",
        corpus=case["corpus"],
        crawled_keys={page.url_key for page in pages},
    )
    proposed["ungroundedHighlights"] = raw_highlights - len(
        proposed["tosReview"]["highlights"]
    )
    proposed["rawListingChecks"] = result.get("listingChecks") or []
    return proposed


def shingles(text: str) -> set[str]:
    words = re.sub(r"[^a-z0-9]+", " ", text.lower().replace("’", "'")).split()
    return {
        " ".join(words[i : i + SHINGLE_WORDS])
        for i in range(max(1, len(words) - SHINGLE_WORDS + 1))
    }


def same_clause(a: str, b: str) -> bool:
    return bool(shingles(a) & shingles(b))


def looks_like_sentence(value: str) -> bool:
    return (
        len(value) > LISTING_VALUE_MAX_CHARS or ". " in value or len(value.split()) > 12
    )


def accepted_ratings(answer: dict) -> set[str]:
    """An answer names one rating, or several when both readings fit the standard."""
    rating = answer["rating"]
    return {rating} if isinstance(rating, str) else set(rating)


def score_call(proposed: dict, gold: dict) -> dict:
    """One scan against the answers for its service.

    Every highlight the scan wrote is looked up in the answers. One matching a
    clause rated `skip` is noise, one matching nothing is unscored, and the
    share left unscored says how far the rating score can be trusted.
    """
    highlights = proposed["tosReview"]["highlights"]
    answers = gold.get("highlights", [])
    judged = []
    for highlight in highlights:
        answer = next(
            (
                a
                for a in answers
                if same_clause(highlight.get("evidence", ""), a["evidence"])
            ),
            None,
        )
        judged.append((highlight, answer))
    rated = [(h, a) for h, a in judged if a and accepted_ratings(a) & set(RATINGS)]
    kyc_expected = gold.get("kycLevel")
    attributes = gold.get("attributes", {})
    added = {int(a["attributeId"]) for a in proposed["attributes"]["add"]}
    removed = {int(a["attributeId"]) for a in proposed["attributes"]["remove"]}
    return {
        "kycLevel": proposed["tosReview"]["kycLevel"],
        "kycChecked": kyc_expected is not None,
        "kycRight": kyc_expected is not None
        and proposed["tosReview"]["kycLevel"] in kyc_expected,
        "highlights": len(highlights),
        "scored": sum(1 for _, a in judged if a),
        "ratingsChecked": len(rated),
        "ratingsRight": sum(
            1 for h, a in rated if h.get("rating") in accepted_ratings(a)
        ),
        "ratingMisses": [
            f"{h.get('title')}: {h.get('rating')} (want {a['rating']})"
            for h, a in rated
            if h.get("rating") not in accepted_ratings(a)
        ],
        "noise": sum(1 for _, a in judged if a and accepted_ratings(a) == {"skip"}),
        "coreExpected": sum(1 for a in answers if a.get("core")),
        "coreFound": sum(
            1
            for a in answers
            if a.get("core")
            and any(
                same_clause(h.get("evidence", ""), a["evidence"]) for h in highlights
            )
        ),
        "negative": sum(1 for h in highlights if h.get("rating") == "negative"),
        "unscored": [
            f"[{h.get('rating')}] {h.get('title')}" for h, a in judged if not a
        ],
        "ungrounded": proposed["ungroundedHighlights"],
        "attributeErrors": sorted(
            [f"+{i}" for i in added & set(attributes.get("mustNotAdd", []))]
            + [f"-{i}" for i in removed & set(attributes.get("mustNotRemove", []))]
        ),
        "badListingValues": sum(
            1
            for c in proposed["rawListingChecks"]
            if looks_like_sentence(str(c.get("found", "")))
        ),
    }


def list_price(call: dict, prices: dict[str, dict]) -> float:
    """What the call costs at the provider's list price, which a subscription can hide."""
    price = prices.get(call["model"].partition("@")[0])
    usage = call.get("usage") or {}
    if not price:
        return 0.0
    return (
        usage.get("prompt_tokens", 0) * price["prompt"]
        + usage.get("completion_tokens", 0) * price["completion"]
    ) / 1_000_000


def ratio(numerator: float, denominator: float) -> str:
    return f"{100 * numerator / denominator:.0f}%" if denominator else "-"


def load_cases(paths: str) -> dict:
    """Frozen cases from one or more files, with the attribute catalog of the first."""
    merged: dict = {"catalog": None, "cases": {}}
    for path in paths.split(","):
        frozen = load_json(Path(path))
        merged["catalog"] = merged["catalog"] or frozen["catalog"]
        merged["cases"].update(frozen["cases"])
    return merged


def kyc_consistency(rows: list[dict]) -> str:
    """How many services got the same KYC level in every repeat."""
    by_slug: dict[str, set[int]] = {}
    for row in rows:
        by_slug.setdefault(row["slug"], set()).add(row["kycLevel"])
    repeated = [
        levels
        for slug, levels in by_slug.items()
        if sum(r["slug"] == slug for r in rows) > 1
    ]
    return (
        f"{sum(len(levels) == 1 for levels in repeated)}/{len(repeated)}"
        if repeated
        else "-"
    )


def print_table(per_model: dict[str, list[dict]], split: str) -> None:
    if not any(r["split"] == split for rows in per_model.values() for r in rows):
        return
    header = (
        f"| Model ({split}) | Calls | Failed | KYC | Same KYC | Ratings | Scored | Noise "
        f"| Core found | Negative | Highlights/scan | Over {HIGHLIGHTS_ASKED_FOR} "
        "| Ungrounded | Bad values | List $/scan | Sec/scan |"
    )
    print(header)
    print("|" + "---|" * (header.count("|") - 1))
    for model, all_rows in sorted(per_model.items()):
        rows = [r for r in all_rows if r["split"] == split]
        if not rows:
            continue
        ok = [r for r in rows if not r["failed"]]

        def total(key: str) -> int:
            return sum(r[key] for r in ok)

        print(
            f"| {model} | {len(rows)} | {len(rows) - len(ok)} "
            f"| {ratio(total('kycRight'), total('kycChecked'))} | {kyc_consistency(ok)} "
            f"| {ratio(total('ratingsRight'), total('ratingsChecked'))} ({total('ratingsChecked')}) "
            f"| {ratio(total('scored'), total('highlights'))} "
            f"| {ratio(total('noise'), total('highlights'))} "
            f"| {ratio(total('coreFound'), total('coreExpected'))} "
            f"| {ratio(total('negative'), total('highlights'))} "
            f"| {total('highlights') / len(ok) if ok else 0:.1f} "
            f"| {sum(r['highlights'] > HIGHLIGHTS_ASKED_FOR for r in ok)} "
            f"| {total('ungrounded')} | {total('badListingValues')} "
            f"| ${sum(r['cost'] for r in rows) / len(rows):.3f} "
            f"| {sum(r['seconds'] for r in rows) / len(rows):.0f} |"
        )
    print()


def score(args: argparse.Namespace) -> None:
    run_dir = Path(args.run_dir)
    frozen = load_cases(args.cases)
    gold = load_json(Path(args.gold))
    catalog_ids = {int(a["id"]) for a in frozen["catalog"]}
    prices = (
        {m["id"]: m["pricing"] for m in load_json(Path(args.pricing))["data"]}
        if args.pricing
        else {}
    )
    task = DeepScanTask()
    task.logger.disabled = True

    per_model: dict[str, list[dict]] = {}
    details: dict[str, list[str]] = {}
    for path in sorted(run_dir.glob("*__*__*.json")):
        call = load_json(path)
        answers = gold.get(call["slug"], {})
        rows = per_model.setdefault(call["model"], [])
        lines = details.setdefault(call["model"], [])
        base = {
            "slug": call["slug"],
            "split": answers.get("split", "train"),
            "cost": list_price(call, prices),
            "seconds": call.get("seconds") or 0,
        }
        if call.get("error"):
            rows.append({**base, "failed": True})
            lines.append(
                f"{call['slug']} #{call['repeat']}: FAILED {call['error'][:200]}"
            )
            continue
        case = frozen["cases"][call["slug"]]
        proposed = as_reviewed(task, case, catalog_ids, call["result"])
        row = {**base, **score_call(proposed, answers), "failed": False}
        rows.append(row)
        want = answers.get("kycLevel")
        lines.append(
            f"{call['slug']} #{call['repeat']}: kyc {row['kycLevel']}"
            f"{'' if want is None else f' (want {want})'}"
            f" | rating misses {row['ratingMisses']} | core {row['coreFound']}/{row['coreExpected']}"
            f" | attr errors {row['attributeErrors']} | unscored {row['unscored']}"
        )

    for split in ("train", "holdout"):
        print_table(per_model, split)
    (run_dir / "details.txt").write_text(
        "\n\n".join(
            f"## {model}\n" + "\n".join(lines)
            for model, lines in sorted(details.items())
        )
    )
    print(f"Per-case details: {run_dir / 'details.txt'}")


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    run_parser = commands.add_parser("run")
    run_parser.add_argument("--models", required=True)
    run_parser.add_argument("--out", required=True)
    run_parser.add_argument("--cases", default=str(DEFAULT_CASES))
    run_parser.add_argument("--slugs")
    run_parser.add_argument("--prompts", help="directory holding a prompt variant")
    run_parser.add_argument("--repeat", type=int, default=1)
    run_parser.add_argument("--parallel", type=int, default=6)
    score_parser = commands.add_parser("score")
    score_parser.add_argument("run_dir")
    score_parser.add_argument("--cases", default=str(DEFAULT_CASES))
    score_parser.add_argument("--gold", default=str(GOLD_PATH))
    score_parser.add_argument(
        "--pricing", help="model list from the provider's /models endpoint"
    )
    args = parser.parse_args()
    run(args) if args.command == "run" else score(args)


if __name__ == "__main__":
    main()
