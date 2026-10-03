"""Cross-organisation workload maths for "My Timeline".

Pure functions: no database, no clock (the caller passes `today`), so every
rule below is covered by plain unit tests. The router (`routers/me.py`) loads
the caller's assigned tasks, hands them in as `WorkTask`s, and returns the
result.

Rules, in one place:

* Effort of a task = estimate_hours, else story_points x HOURS_PER_POINT,
  else DEFAULT_TASK_HOURS. The source is reported so the page can show "~"
  for guessed effort instead of pretending precision.
* Only remaining work counts: todo/in_progress 100%, review REVIEW_FACTOR
  (it is waiting on someone else), done 0 and never warned about.
* Effort is spread evenly over the person's working days between the start
  and the due date. Days already gone are not planned: a task that started
  last week is spread over today..due. A task with only a due date lands on
  the last working day on or before that date (work must be finished by the
  deadline, so a Sunday deadline means Saturday). An open task past its due
  date is carried to today.
* A task with no due date has no place on a calendar: it is reported as
  unscheduled rather than silently dropped.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, Iterable, List, Optional, Set

HOURS_PER_POINT = 2.0
DEFAULT_TASK_HOURS = 2.0
REVIEW_FACTOR = 0.25
BUSY_AT = 0.75        # share of capacity at which a day is "busy"
OVER_AT = 1.0         # above this the day is overloaded (amber)
SEVERE_AT = 1.25      # above this it is severe (red)
PILEUP_COUNT = 3      # tasks due on one day
DEFAULT_WORK_DAYS = (1, 2, 3, 4, 5, 6)  # ISO weekday numbers, Mon=1 .. Sun=7
DEFAULT_HOURS_PER_DAY = 8.0
MAX_WINDOW_DAYS = 366


@dataclass
class WorkTask:
    id: int
    org_id: int
    status: str                      # todo | in_progress | review | done
    due: Optional[date]
    start: Optional[date] = None
    estimate_hours: Optional[float] = None
    story_points: Optional[int] = None
    blocked: bool = False
    blocker_due: Optional[date] = None   # latest due date among unfinished blockers


def effort(task: WorkTask):
    """(hours, source) for the whole task, before the status factor."""
    if task.estimate_hours and task.estimate_hours > 0:
        return float(task.estimate_hours), "estimate"
    if task.story_points and task.story_points > 0:
        return task.story_points * HOURS_PER_POINT, "points"
    return DEFAULT_TASK_HOURS, "default"


def remaining_factor(status: str) -> float:
    if status == "done":
        return 0.0
    if status == "review":
        return REVIEW_FACTOR
    return 1.0


def _is_working(d: date, work_days: Set[int]) -> bool:
    return d.isoweekday() in work_days


def _daterange(a: date, b: date):
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


def schedule(task: WorkTask, today: date, work_days: Set[int]):
    """Days the remaining effort lands on, plus flags.

    Returns (days, overdue). `days` is empty only for an unscheduled task.
    """
    if task.due is None:
        return [], False

    overdue = task.due < today
    if overdue:
        return [today], True

    first = task.start if task.start and task.start <= task.due else task.due
    first = max(first, today)
    span = [d for d in _daterange(first, task.due) if _is_working(d, work_days)]
    if span:
        # A task that has a real start..due range spreads over it; a due-only
        # task has first == due, so span is just that day when it is working.
        return span, False

    # Due-only (or whole range off): finish on the nearest working day before
    # the deadline, but never in the past.
    probe = task.due
    for _ in range(7):
        probe -= timedelta(days=1)
        if probe < today:
            break
        if _is_working(probe, work_days):
            return [probe], False
    return [task.due], False


def level_for(hours: float, capacity: float) -> str:
    if capacity <= 0:
        return "severe" if hours > 0 else "light"
    ratio = hours / capacity
    if ratio > SEVERE_AT:
        return "severe"
    if ratio > OVER_AT:
        return "over"
    if ratio >= BUSY_AT:
        return "busy"
    return "light"


def compute(
    tasks: Iterable[WorkTask],
    today: date,
    window_from: date,
    window_to: date,
    work_days: Iterable[int] = DEFAULT_WORK_DAYS,
    hours_per_day: float = DEFAULT_HOURS_PER_DAY,
):
    work_set = set(work_days)
    tasks = list(tasks)

    per_task: Dict[int, dict] = {}
    unscheduled: List[int] = []
    load: Dict[date, float] = {}
    day_tasks: Dict[date, List[int]] = {}
    day_orgs: Dict[date, Set[int]] = {}
    warnings: List[dict] = []

    for t in tasks:
        hours, source = effort(t)
        remaining = round(hours * remaining_factor(t.status), 4)
        days, overdue = schedule(t, today, work_set) if t.status != "done" else ([], False)

        info = {
            "effort_hours": round(hours, 2),
            "effort_source": source,
            "remaining_hours": round(remaining, 2),
            "scheduled_start": days[0].isoformat() if days else None,
            "scheduled_end": days[-1].isoformat() if days else None,
            "overdue": overdue,
        }
        per_task[t.id] = info

        if t.status == "done":
            continue
        if t.due is None:
            unscheduled.append(t.id)
            continue

        share = remaining / len(days)
        for d in days:
            load[d] = load.get(d, 0.0) + share
            day_tasks.setdefault(d, []).append(t.id)
            day_orgs.setdefault(d, set()).add(t.org_id)

        if overdue:
            warnings.append({
                "kind": "overdue", "severity": "amber", "date": t.due.isoformat(),
                "task_ids": [t.id], "cross_org": False,
            })
        elif not _is_working(t.due, work_set) and window_from <= t.due <= window_to:
            warnings.append({
                "kind": "due_on_day_off", "severity": "info", "date": t.due.isoformat(),
                "task_ids": [t.id], "cross_org": False,
            })

        if t.blocked and t.blocker_due is not None:
            planned_start = t.start if t.start and t.start <= t.due else t.due
            if planned_start < t.blocker_due:
                warnings.append({
                    "kind": "starts_before_blocker", "severity": "amber",
                    "date": planned_start.isoformat(), "task_ids": [t.id],
                    "blocker_due": t.blocker_due.isoformat(), "cross_org": False,
                })

    # Deadline pile-ups: several open tasks due the same day.
    due_groups: Dict[date, List[WorkTask]] = {}
    for t in tasks:
        if t.status != "done" and t.due is not None and window_from <= t.due <= window_to:
            due_groups.setdefault(t.due, []).append(t)
    for d, group in sorted(due_groups.items()):
        if len(group) >= PILEUP_COUNT:
            warnings.append({
                "kind": "deadline_pileup", "severity": "amber", "date": d.isoformat(),
                "task_ids": [g.id for g in group],
                "cross_org": len({g.org_id for g in group}) > 1,
            })

    days_out: List[dict] = []
    for d in sorted(load):
        if not (window_from <= d <= window_to):
            continue
        hours = round(load[d], 2)
        capacity = hours_per_day if _is_working(d, work_set) else 0.0
        level = level_for(hours, capacity)
        orgs = sorted(day_orgs[d])
        days_out.append({
            "date": d.isoformat(), "hours": hours, "capacity": capacity,
            "level": level, "task_ids": day_tasks[d], "org_ids": orgs,
        })
        if level in ("over", "severe"):
            warnings.append({
                "kind": "overload", "severity": "red" if level == "severe" else "amber",
                "date": d.isoformat(), "task_ids": day_tasks[d],
                "hours": hours, "capacity": capacity, "cross_org": len(orgs) > 1,
            })

    warnings.sort(key=lambda w: (w["date"], w["kind"]))

    horizon = today + timedelta(days=13)
    overloaded = [d for d in days_out if d["level"] in ("over", "severe")]
    soon = [d for d in overloaded if today <= date.fromisoformat(d["date"]) <= horizon]
    first = overloaded[0] if overloaded else None
    summary = {
        "overloaded_days_next_14": len(soon),
        "overloaded_days_total": len(overloaded),
        "first_clash": (
            {
                "date": first["date"], "task_count": len(first["task_ids"]),
                "org_count": len(first["org_ids"]), "hours": first["hours"],
                "capacity": first["capacity"],
            } if first else None
        ),
        "warning_count": len(warnings),
        "unscheduled_count": len(unscheduled),
    }

    return {
        "days": days_out,
        "warnings": warnings,
        "per_task": per_task,
        "unscheduled_task_ids": unscheduled,
        "summary": summary,
    }


def parse_work_days(raw: Optional[str]) -> Set[int]:
    """'1,2,3,4,5,6' -> {1..6}. Raises ValueError on anything else."""
    if raw is None or raw == "":
        return set(DEFAULT_WORK_DAYS)
    out = set()
    for part in raw.split(","):
        n = int(part.strip())
        if n < 1 or n > 7:
            raise ValueError("work_days must be ISO weekday numbers 1 (Mon) to 7 (Sun)")
        out.add(n)
    if not out:
        raise ValueError("work_days must not be empty")
    return out
