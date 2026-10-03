"""Unit tests for the pure workload maths (utils/workload.py)."""

from datetime import date, timedelta

from utils import workload as w
from utils.workload import WorkTask

# 2026-10-05 is a Monday.
MON = date(2026, 10, 5)
SAT = MON + timedelta(days=5)
SUN = MON + timedelta(days=6)
WINDOW = (MON - timedelta(days=14), MON + timedelta(days=60))


def run(tasks, today=MON, **kw):
    return w.compute(tasks, today, WINDOW[0], WINDOW[1], **kw)


def T(id, due=None, start=None, org=1, status="todo", **kw):
    return WorkTask(id=id, org_id=org, status=status, due=due, start=start, **kw)


def day(result, d):
    return next((x for x in result["days"] if x["date"] == d.isoformat()), None)


def kinds(result):
    return [x["kind"] for x in result["warnings"]]


# ---- effort -----------------------------------------------------------

def test_effort_prefers_estimate_then_points_then_default():
    assert w.effort(T(1, estimate_hours=5, story_points=8)) == (5.0, "estimate")
    assert w.effort(T(1, story_points=3)) == (6.0, "points")
    assert w.effort(T(1, story_points=0)) == (2.0, "default")
    assert w.effort(T(1)) == (2.0, "default")


def test_review_counts_a_quarter_and_done_counts_nothing():
    r = run([T(1, due=MON, estimate_hours=8, status="review"),
             T(2, due=MON, estimate_hours=8, status="done")])
    assert day(r, MON)["hours"] == 2.0
    assert r["per_task"][2]["remaining_hours"] == 0
    assert 2 not in day(r, MON)["task_ids"]


# ---- spreading --------------------------------------------------------

def test_range_is_spread_evenly_over_working_days():
    r = run([T(1, start=MON, due=MON + timedelta(days=2), estimate_hours=12)])
    for i in range(3):
        assert day(r, MON + timedelta(days=i))["hours"] == 4.0


def test_sunday_inside_a_range_gets_no_work():
    # Fri..Mon spans a Sunday: Fri, Sat, Mon share the work (Mon-Sat week).
    fri = MON - timedelta(days=3)
    r = run([T(1, start=fri, due=MON + timedelta(days=7), estimate_hours=9)], today=fri)
    assert day(r, SUN) is None
    assert sum(x["hours"] for x in r["days"]) == 9.0


def test_due_only_task_lands_on_due_day():
    r = run([T(1, due=MON + timedelta(days=2), estimate_hours=3)])
    assert day(r, MON + timedelta(days=2))["hours"] == 3.0


def test_sunday_deadline_means_saturday():
    r = run([T(1, due=SUN, estimate_hours=3)])
    assert day(r, SAT)["hours"] == 3.0
    assert day(r, SUN) is None
    assert "due_on_day_off" in kinds(r)


def test_past_days_are_not_planned():
    r = run([T(1, start=MON - timedelta(days=4), due=MON + timedelta(days=1), estimate_hours=6)])
    assert day(r, MON - timedelta(days=1)) is None
    assert day(r, MON)["hours"] == 3.0 and day(r, MON + timedelta(days=1))["hours"] == 3.0


def test_overdue_open_task_is_carried_to_today_and_warned():
    r = run([T(1, due=MON - timedelta(days=3), estimate_hours=2)])
    assert day(r, MON)["hours"] == 2.0
    assert r["per_task"][1]["overdue"] is True
    assert "overdue" in kinds(r)


def test_no_due_date_is_unscheduled_not_dropped():
    r = run([T(1), T(2, due=MON)])
    assert r["unscheduled_task_ids"] == [1]
    assert r["summary"]["unscheduled_count"] == 1


def test_start_after_due_is_treated_as_due_only():
    r = run([T(1, start=MON + timedelta(days=5), due=MON + timedelta(days=1), estimate_hours=2)])
    assert day(r, MON + timedelta(days=1))["hours"] == 2.0


# ---- overload ---------------------------------------------------------

def test_levels_at_the_thresholds():
    assert w.level_for(5.9, 8) == "light"
    assert w.level_for(6, 8) == "busy"
    assert w.level_for(8, 8) == "busy"      # exactly full is not overloaded
    assert w.level_for(8.5, 8) == "over"
    assert w.level_for(10, 8) == "over"     # exactly 125%
    assert w.level_for(10.5, 8) == "severe"
    assert w.level_for(1, 0) == "severe"    # work on a day off


def test_overload_warning_with_hours_and_capacity():
    r = run([T(1, due=MON, estimate_hours=5), T(2, due=MON, estimate_hours=5, org=2)])
    d = day(r, MON)
    assert d["hours"] == 10 and d["capacity"] == 8 and d["level"] == "over"
    over = [x for x in r["warnings"] if x["kind"] == "overload"]
    assert len(over) == 1 and over[0]["severity"] == "amber"
    assert over[0]["cross_org"] is True


def test_overload_inside_one_org_is_not_cross_org():
    r = run([T(1, due=MON, estimate_hours=6), T(2, due=MON, estimate_hours=6)])
    assert [x for x in r["warnings"] if x["kind"] == "overload"][0]["cross_org"] is False


def test_severe_is_red():
    r = run([T(1, due=MON, estimate_hours=6), T(2, due=MON, estimate_hours=6, org=2)])
    assert day(r, MON)["level"] == "severe"
    assert [x for x in r["warnings"] if x["kind"] == "overload"][0]["severity"] == "red"


def test_exactly_full_day_has_no_overload_warning():
    r = run([T(1, due=MON, estimate_hours=8)])
    assert "overload" not in kinds(r)


def test_capacity_follows_the_persons_own_week():
    five_day = {1, 2, 3, 4, 5}
    # Saturday deadline is a day off for a Mon-Fri person -> lands on Friday.
    r = run([T(1, due=SAT, estimate_hours=3)], work_days=five_day)
    assert day(r, SAT - timedelta(days=1))["hours"] == 3.0
    assert "due_on_day_off" in kinds(r)
    # Same work, 4-hour days -> overloaded.
    r = run([T(1, due=MON, estimate_hours=5)], hours_per_day=4)
    assert day(r, MON)["level"] == "over"


def test_summary_counts_the_next_two_weeks_and_first_clash():
    far = MON + timedelta(days=30)
    r = run([T(1, due=MON + timedelta(days=1), estimate_hours=10),
             T(2, due=far, estimate_hours=10)])
    s = r["summary"]
    assert s["overloaded_days_next_14"] == 1
    assert s["overloaded_days_total"] == 2
    assert s["first_clash"]["date"] == (MON + timedelta(days=1)).isoformat()


# ---- other warnings ---------------------------------------------------

def test_deadline_pileup_needs_three():
    two = run([T(1, due=MON, estimate_hours=1), T(2, due=MON, estimate_hours=1)])
    assert "deadline_pileup" not in kinds(two)
    three = run([T(i, due=MON, estimate_hours=1, org=i % 2) for i in (1, 2, 3)])
    p = [x for x in three["warnings"] if x["kind"] == "deadline_pileup"][0]
    assert sorted(p["task_ids"]) == [1, 2, 3] and p["cross_org"] is True


def test_done_tasks_do_not_pile_up():
    r = run([T(1, due=MON, estimate_hours=1), T(2, due=MON, estimate_hours=1),
             T(3, due=MON, estimate_hours=1, status="done")])
    assert "deadline_pileup" not in kinds(r)


def test_starts_before_blocker_is_due():
    blocker = MON + timedelta(days=4)
    r = run([T(1, start=MON + timedelta(days=1), due=MON + timedelta(days=6),
               blocked=True, blocker_due=blocker)])
    assert "starts_before_blocker" in kinds(r)
    ok = run([T(1, start=blocker, due=blocker + timedelta(days=2),
                blocked=True, blocker_due=blocker)])
    assert "starts_before_blocker" not in kinds(ok)


def test_blocked_without_blocker_date_gives_no_guess():
    r = run([T(1, start=MON, due=MON + timedelta(days=3), blocked=True, blocker_due=None)])
    assert "starts_before_blocker" not in kinds(r)


# ---- window and parsing ----------------------------------------------

def test_days_outside_the_window_are_not_returned():
    r = w.compute([T(1, due=MON + timedelta(days=100), estimate_hours=3)],
                  MON, MON, MON + timedelta(days=30))
    assert r["days"] == []


def test_parse_work_days():
    assert w.parse_work_days(None) == {1, 2, 3, 4, 5, 6}
    assert w.parse_work_days("1, 3,5") == {1, 3, 5}
    for bad in ("0", "8", "a", "1,,2"):
        try:
            w.parse_work_days(bad)
        except ValueError:
            continue
        raise AssertionError(f"{bad!r} should be rejected")
