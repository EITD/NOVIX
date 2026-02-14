#!/usr/bin/env python3
"""
Regression evaluation script for WenShape writing agent.
Runs fixed instruction cases and outputs context_debug + metrics.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_CASES: List[Dict[str, str]] = [
    {"instruction": "描写主角在雨夜的内心挣扎与决定"},
    {"instruction": "写一段战斗场景，突出速度与压迫感"},
    {"instruction": "解释某个世界观规则的代价与禁忌"},
    {"instruction": "刻画配角对主角的怀疑与冲突"},
    {"instruction": "补写一段回忆，交代过去事件"},
    {"instruction": "描写两位角色的和解对话"},
]


def _resolve_backend_dir() -> Path:
    return Path(__file__).resolve().parents[1]


def _ensure_sys_path(backend_dir: Path) -> None:
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))


def _load_cases_from_file(path: Path) -> List[Dict[str, str]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        cases: List[Dict[str, str]] = []
        for item in raw:
            if isinstance(item, str):
                cases.append({"instruction": item})
            elif isinstance(item, dict) and item.get("instruction"):
                cases.append({"instruction": str(item["instruction"])})
        return cases
    return []


def _build_metrics(
    context_debug: Optional[Dict[str, Any]],
    questions: Optional[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    context_debug = context_debug or {}
    research_trace = context_debug.get("research_trace") or []
    retrieval_requests = context_debug.get("retrieval_requests") or []
    evidence_pack = context_debug.get("evidence_pack") or {}
    report = context_debug.get("sufficiency_report") or {}

    evidence_types = (evidence_pack.get("stats") or {}).get("types") or report.get("evidence_types") or {}
    missing_entities = report.get("missing_entities") or []
    return {
        "rounds_used": len(research_trace),
        "tool_calls": len(retrieval_requests),
        "evidence_types": evidence_types,
        "missing_entities_count": len(missing_entities),
        "asked_questions": bool(questions),
        "critical_weak_gaps_count": len(report.get("critical_weak_gaps") or []),
        "unknown_gaps_count": len(report.get("unknown_gaps") or []),
        "research_stop_reason": context_debug.get("research_stop_reason") or "",
    }


def _build_progress_metrics(progress_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    stage_counts: Dict[str, int] = {}
    round_set = set()
    queries: List[str] = []
    total_hits = 0
    top_sources_count = 0
    for event in progress_events or []:
        stage = event.get("stage")
        if stage:
            stage_counts[stage] = stage_counts.get(stage, 0) + 1
        round_value = event.get("round")
        if round_value is not None:
            round_set.add(round_value)
        for query in event.get("queries") or []:
            if query:
                queries.append(query)
        hits = event.get("hits")
        if isinstance(hits, (int, float)):
            total_hits += int(hits)
        top_sources = event.get("top_sources") or []
        if isinstance(top_sources, list):
            top_sources_count += len(top_sources)
    unique_queries = list(dict.fromkeys(queries))
    return {
        "event_count": len(progress_events or []),
        "stage_counts": stage_counts,
        "rounds_seen": len(round_set),
        "queries_count": len(unique_queries),
        "total_hits": total_hits,
        "top_sources_count": top_sources_count,
    }


def _build_checks(
    context_debug: Optional[Dict[str, Any]],
    questions: Optional[List[Dict[str, Any]]],
    progress_events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    context_debug = context_debug or {}
    report = context_debug.get("sufficiency_report") or {}
    progress_metrics = _build_progress_metrics(progress_events)
    stage_counts = progress_metrics.get("stage_counts") or {}
    stop_reason = context_debug.get("research_stop_reason") or ""
    research_trace = context_debug.get("research_trace") or []

    checks = {
        "has_progress_trace": progress_metrics.get("event_count", 0) > 0,
        "has_execute_retrieval": stage_counts.get("execute_retrieval", 0) > 0,
        "has_generate_plan": stage_counts.get("generate_plan", 0) > 0,
        "has_research_trace": len(research_trace) > 0,
        "stop_reason_present": bool(stop_reason),
        "questions_only_when_needed": (not questions) or bool(report.get("needs_user_input")),
        "no_questions_when_sufficient": (not questions) if report.get("sufficient") else True,
        "no_critical_weak_when_sufficient": (not report.get("sufficient")) or not bool(report.get("critical_weak_gaps")),
    }
    failed = [key for key, ok in checks.items() if not ok]
    return {
        "pass": not failed,
        "failed": failed,
        "checks": checks,
    }


async def _run_case(
    project_id: str,
    chapter: str,
    chapter_title: str,
    instruction: str,
    target_word_count: int,
    data_dir: str,
    research_only: bool,
    offline: bool,
) -> Dict[str, Any]:
    from app.orchestrator import Orchestrator

    progress_events: List[Dict[str, Any]] = []

    async def progress_callback(payload: Dict[str, Any]) -> None:
        event = dict(payload or {})
        if event.get("type") == "token":
            return
        if event.get("type") == "stream_end" and isinstance(event.get("draft"), dict):
            draft = event.get("draft") or {}
            event["draft"] = {
                "chapter": draft.get("chapter"),
                "version": draft.get("version"),
                "word_count": draft.get("word_count"),
            }
        progress_events.append({"ts": time.time(), **event})

    orchestrator = Orchestrator(data_dir=data_dir, progress_callback=progress_callback)
    if research_only:
        result = await orchestrator.run_research_only(
            project_id=project_id,
            chapter=chapter,
            chapter_title=chapter_title,
            chapter_goal=instruction,
            character_names=None,
            offline=offline,
        )
    else:
        result = await orchestrator.start_session(
            project_id=project_id,
            chapter=chapter,
            chapter_title=chapter_title,
            chapter_goal=instruction,
            target_word_count=target_word_count,
            character_names=None,
        )

    raw_context_debug = result.get("context_debug")
    if isinstance(raw_context_debug, dict):
        context_debug = dict(raw_context_debug)
    else:
        context_debug = {}
        if raw_context_debug:
            context_debug["raw"] = raw_context_debug
    context_debug["progress_events"] = progress_events
    questions = result.get("questions") or []
    metrics = _build_metrics(context_debug, questions)
    progress_metrics = _build_progress_metrics(progress_events)
    checks = _build_checks(context_debug, questions, progress_events)

    return {
        "instruction": instruction,
        "status": result.get("status"),
        "success": result.get("success", False),
        "questions": questions,
        "metrics": metrics,
        "progress_metrics": progress_metrics,
        "checks": checks,
        "context_debug": context_debug,
        "error": result.get("error"),
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WenShape regression evaluation runner")
    parser.add_argument("--project-id", required=True, help="Project ID")
    parser.add_argument("--chapter", required=True, help="Chapter ID")
    parser.add_argument("--chapter-title", default="", help="Chapter title (optional)")
    parser.add_argument("--instruction", default="", help="Single instruction")
    parser.add_argument("--cases-file", default="", help="JSON file with instruction list")
    parser.add_argument("--target-word-count", type=int, default=3000, help="Target word count")
    parser.add_argument("--output", default="", help="Output JSON file (optional)")
    parser.add_argument("--data-dir", default="", help="Data directory root (optional)")
    parser.add_argument("--research-only", action="store_true", help="Run research loop only (no draft generation)")
    parser.add_argument("--offline", action="store_true", help="Offline mode (no LLM calls, requires scene_brief.yaml)")
    return parser.parse_args()


def _build_cases(args: argparse.Namespace) -> List[Dict[str, str]]:
    if args.instruction:
        return [{"instruction": args.instruction}]
    if args.cases_file:
        cases = _load_cases_from_file(Path(args.cases_file))
        if cases:
            return cases
    return list(DEFAULT_CASES)


async def main() -> int:
    args = _parse_args()
    backend_dir = _resolve_backend_dir()
    _ensure_sys_path(backend_dir)

    if args.data_dir:
        data_dir = Path(args.data_dir).as_posix()
    else:
        candidate_dirs = [
            backend_dir / "data",
            backend_dir.parent / "data",
        ]
        data_dir_path = next((path for path in candidate_dirs if path.exists()), candidate_dirs[0])
        data_dir = data_dir_path.as_posix()
    chapter_title = args.chapter_title or f"章节 {args.chapter}"
    cases = _build_cases(args)

    results: List[Dict[str, Any]] = []
    for idx, case in enumerate(cases, start=1):
        instruction = case.get("instruction", "").strip()
        if not instruction:
            continue
        case_result = await _run_case(
            project_id=args.project_id,
            chapter=args.chapter,
            chapter_title=chapter_title,
            instruction=instruction,
            target_word_count=args.target_word_count,
            data_dir=data_dir,
            research_only=bool(args.research_only),
            offline=bool(args.offline),
        )
        case_result["case_id"] = idx
        case_result["chapter"] = args.chapter
        results.append(case_result)

    output = {
        "project_id": args.project_id,
        "chapter": args.chapter,
        "chapter_title": chapter_title,
        "case_count": len(results),
        "cases": results,
    }
    passed = [case for case in results if case.get("checks", {}).get("pass")]
    failed = [case for case in results if not case.get("checks", {}).get("pass")]
    output["summary"] = {
        "pass_count": len(passed),
        "fail_count": len(failed),
        "failed_cases": [
            {
                "case_id": case.get("case_id"),
                "instruction": case.get("instruction"),
                "failed": (case.get("checks") or {}).get("failed") or [],
            }
            for case in failed
        ],
    }

    if args.output:
        Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"已写入: {args.output}")
    else:
        print(json.dumps(output, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
