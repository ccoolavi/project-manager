# Agent Prompt — Seed Project: CIL MT Mechanical CBT 2026

> **How to use:** paste this entire file into your Claude Code project-management agent as a single message. It is written to be self-contained: the agent discovers your app's schema first, then maps the data below onto it. Do not edit the Data section's numbers — they are the output of a worked estimate, not placeholders.

---

## Role

You are a senior technical project manager and full-stack engineer with 15+ years of experience seeding structured project data into bespoke task-management systems. You are precise about schema discovery, you never assume a data model, and you verify every write.

## Task

Create the first project in this application: a 9-day, deadline-fixed exam preparation project for the Coal India Limited Management Trainee (Mechanical) Computer Based Test. Populate it completely — project record, milestones, all tasks and subtasks, dependencies, time estimates, and the exam-day checklist — using the data in the **Data** section verbatim.

---

## Instruction

### Phase 1 — Schema discovery (do this before writing anything)

1. Inspect the codebase to determine how projects, tasks, subtasks, milestones, tags, priorities, statuses, and time estimates are modelled. Read the schema/migration files, the ORM models, and any seed or fixture files that already exist.
2. Identify the correct write path. In order of preference: (a) an existing seed/fixture script, (b) the app's own service/repository layer, (c) direct database insert. Do not write raw SQL if a service layer exists.
3. Report back a short mapping table — my field name on the left, your app's actual field on the right — **before** you insert anything. Flag any field in the Data section that has no home in the schema.
4. If the schema lacks something structurally important (e.g. no dependency support, no time estimates), tell me. Propose the migration; do not silently drop the data, and do not run the migration until I approve it.

### Phase 2 — Population

5. Create in this order: project → milestones → tasks → subtasks → dependencies. Respect foreign-key ordering.
6. Preserve the task IDs given below (`CIL-001` etc.) in whatever field your schema offers for an external or human-readable reference. If none exists, prefix the task title with the ID.
7. Set every task's status to the schema's equivalent of `not started`, except `CIL-001`, which is `in progress`.
8. Where the schema supports scheduled dates, use the dates given. All times are IST. Where it supports estimated effort, use the hour figures given.
9. Idempotency: check whether this project already exists before creating it. If it does, ask me whether to update or abort. Never create a duplicate.

### Phase 3 — Verification

10. After writing, read the data back out through the app's own query path and print the full project tree — project, milestones, tasks in date order with their estimates and dependencies.
11. Print the sum of estimated hours per day and the grand total. **The grand total must be 62.** If it isn't, you have dropped or duplicated something — find it and fix it before reporting done.
12. Run the app's existing test suite. If seeding broke anything, fix it.

### Guardrails

- Do not invent tasks, deadlines, or scope that is not in the Data section. If you think something is missing, say so in your report rather than adding it.
- Do not "improve" the schedule, rebalance the hours, or reorder the study sequence. The sequencing is deliberate and is explained in the Data section's notes.
- Do not commit or push unless I ask. Show me a diff.
- If any step fails, stop and report — do not work around a failure silently.

---

## Data

### Project record

| Field | Value |
|---|---|
| **Name** | CIL MT Mechanical CBT 2026 |
| **Type** | Competitive exam preparation |
| **Start date** | 2026-08-14 |
| **End date** | 2026-08-24 |
| **Hard deadline** | 2026-08-24 15:00 IST (immovable) |
| **Total estimated effort** | 62 hours |
| **Status** | Active |
| **Priority** | High |

**Description:**
> Coal India Limited Management Trainee recruitment, Advertisement No. 03/2026, Mechanical discipline. Computer Based Test on 24 August 2026, 15:00–18:00 IST, reporting 13:30, centre in Pune, Maharashtra. Application sequence number CIL20260064259. 200 MCQs across two papers of 100 marks each, single 3-hour sitting, one mark per question, no negative marking, bilingual except General English.
>
> Context: Mechanical Engineering subjects were last studied ~6–7 years ago; current domain is software/data. A full-coverage rebuild for this syllabus is estimated at 375–470 hours. Only ~62 hours are available. The merit list is therefore **not** the objective this cycle. This project optimises for two things only: clearing the Paper II qualifying floor, and producing a reliable calibration score for the decision matrix below.

### Targets

| Metric | Value | Notes |
|---|---|---|
| **Combined target score** | 117 / 200 | Realistic model output, not aspirational |
| **Paper I target** | 70 / 100 | Leverages existing quant/DI/reasoning skill |
| **Paper II target** | 45 / 100 | Includes ~12 marks of expected blind-guess yield |
| **Paper II hard floor** | **40 / 100** | **UR/EWS. Below this the entire attempt is void regardless of Paper I.** OBC-NCL 35, SC/ST/PwBD 30 |
| **Paper I hard floor** | 40 / 100 | Not at risk |
| **Buffer above Paper II floor** | 5 marks | Thin. This is the project's single largest risk. |

Track these as project-level metrics if the schema supports it; otherwise put them in the project description.

### Milestones

| ID | Milestone | Due | Notes |
|---|---|---|---|
| `M1` | Manufacturing Tech + Engineering Materials complete | 2026-08-18 EOD | The two recall-heavy blocks. ~14 of the 45 Paper II marks. Non-negotiable. |
| `M2` | Admit card downloaded, centre confirmed, route checked | 2026-08-21 | Portal opens this date |
| `M3` | Full 200-question mock completed in 15:00–18:00 slot | 2026-08-22 | Must be run in the real time window |
| `M4` | Formula sheet finalised, 3 revision passes done | 2026-08-23 EOD | |
| `M5` | Exam sat, all 200 questions answered | 2026-08-24 18:00 | Zero blanks is a pass condition |

### Task list

Scheduled hours by day: 14th=2, 15th=9, 16th=8, 17th=5, 18th=5, 19th=5, 20th=5, 21st=5, 22nd=8, 23rd=6, 24th=4. **Total 62.**

---

**`CIL-001` — Setup and baseline** · 2026-08-14 · 2 hrs · Priority: High · Status: in progress
- Create the formula-sheet document (this is the highest-value artifact of the whole project — it is what gets revised on the 23rd and on the morning of the 24th)
- Skim one CIL MT Mechanical previous-year Paper II for 30 minutes — pattern and difficulty calibration only, do not attempt to solve
- Download current-affairs capsule PDFs for March–August 2026
- Bookmark the CIL application portal for the admit card download

**`CIL-002` — Manufacturing Technology I: casting and welding** · 2026-08-15 · 9 hrs · Priority: **Critical** · Milestone: M1
- Casting: processes, defects, riser and gating design, solidification time
- Welding: GTAW/TIG, arc processes, weld defects, heat-affected zone
- Add every formula encountered to the formula sheet as you go
- *Note: 15 August is a public holiday — this is a full-capacity day, protect it.*

**`CIL-003` — Manufacturing Technology II: machining and metrology** · 2026-08-16 · 8 hrs · Priority: **Critical** · Milestone: M1 · Depends on: `CIL-002`
- Machining: cutting tool geometry, tool wear mechanisms, Taylor's tool life equation
- Non-conventional: EDM, ECM, chemical machining
- Powder metallurgy, reaming, limits/fits/tolerances
- 30 MCQs from the objective book at the end of the block

**`CIL-004` — Engineering Materials: first pass** · 2026-08-17 · 5 hrs · Priority: **Critical** · Milestone: M1
- Crystal structures (BCC/FCC/HCP), packing factors, coordination numbers
- Iron-carbon diagram, carbon content ranges for steels and cast irons
- Heat treatment: annealing, normalising, quenching, tempering, case hardening
- Alloying elements and their effects
- **Produce a one-page Engineering Materials cheat sheet** — this is a separate deliverable from the formula sheet
- *Rationale: 8 questions available on pure recall. Highest marks-per-hour block in the entire syllabus.*

**`CIL-005` — Engineering Materials revision + CNC/CAD/CAM** · 2026-08-18 · 5 hrs · Priority: High · Milestone: M1 · Depends on: `CIL-004`
- Re-run the Engineering Materials cheat sheet (2 hrs)
- CNC: coordinate systems, floating zero, G/M codes at recognition level, CAD/CAM basics (3 hrs)

**`CIL-006` — Fluid Mechanics: formula recognition only** · 2026-08-19 · 5 hrs · Priority: Medium
- Properties, viscosity, manometry, buoyancy
- Continuity, Bernoulli, momentum
- Pipe flow, friction factor, laminar vs turbulent, water hammer, cavitation
- All dimensionless numbers (Reynolds, Froude, Mach, Weber, Euler) — what each represents
- **Recognition level only. Do not derive anything. Do not solve long numericals.**
- *Rationale: 21–22 questions but a full rebuild is 55–70 hours, which does not exist in this budget.*

**`CIL-007` — Strength of Materials: formula recognition only** · 2026-08-20 · 5 hrs · Priority: Medium
- Stress-strain, elastic constants and their relationships
- SFD/BMD standard cases, bending and torsion formulas
- Euler's buckling — all four end conditions
- Thin cylinders, Mohr's circle construction
- **Recognition level only.**

**`CIL-008` — Admit card and logistics** · 2026-08-21 · 1 hr · Priority: **Critical** · Milestone: M2
- Download e-admit card from the application portal (opens today), print two copies
- Confirm the exact test-centre address and check travel time from Pimpri — Pune centres are frequently in Hinjawadi, Wagholi or Talegaon, which range from 45 to 90 minutes
- Verify the photo ID named on the admit card is in hand
- Plan departure time working backwards from 13:30 reporting

**`CIL-009` — Paper I: coal sector and current affairs** · 2026-08-21 · 4 hrs · Priority: High
- CIL subsidiaries and their headquarters
- Latest annual coal production figure, India's reserve position — pull from CIL's Annual Report on coalindia.in (Investors section) and the Ministry of Coal site, not from coaching PDFs
- Current major coal-sector schemes
- Current affairs capsule sweep, March–August 2026
- *Rationale: the General Awareness section is where most Mechanical candidates lose marks by default. ~4–6 marks for ~4 hours.*

**`CIL-010` — Full mock in the real exam slot** · 2026-08-22 · 8 hrs · Priority: **Critical** · Milestone: M3
- **15:00–18:00: full 200-question mock, strict timing, no breaks, no reference material**
- Use the exam-day allocation strategy (see below) — this is a rehearsal of the strategy, not just the content
- Afterwards: full error analysis, log every wrong answer by topic
- Feed every missed formula into the formula sheet
- *Rationale: afternoon alertness at 15:00 is untested. Do not let exam day be the first time you sit a 3-hour paper in this window.*

**`CIL-011` — Consolidation, no new material** · 2026-08-23 · 6 hrs · Priority: High · Milestone: M4 · Depends on: `CIL-010`
- Formula sheet: three complete passes
- Engineering Materials cheat sheet: two passes
- Review the mock error log
- **Hard rule: no new topics today.** Anything not learned by now will not be learned tonight, and attempting it costs retention on what you do know
- Sleep early — the exam is a 3-hour afternoon cognitive load

**`CIL-012` — Exam morning** · 2026-08-24 · 4 hrs · Priority: **Critical**
- 08:00–12:00: formula sheet and materials cheat sheet passes
- Eat properly before 12:30 — do not sit a 15:00–18:00 paper hungry or over-full
- Depart by 12:30 (adjust against the travel time confirmed in `CIL-008`)
- Carry the formula sheet to read in the vehicle and during the 13:30–15:00 waiting period; expect to surrender it at the gate

**`CIL-013` — Exam execution** · 2026-08-24 15:00 · Priority: **Critical** · Milestone: M5

Create these as subtasks or a checklist — they are the in-exam protocol:
- **Paper I first, 70 minutes.** Bank the strongest marks while fresh. Do not let Paper II numericals eat the clock before Paper I is secured.
- **Paper II, 95 minutes, two passes.** Pass 1 (~30 min): answer only what is immediately known. Pass 2: work everything reachable by reasoning.
- **Final 15 minutes: fill every blank.** No exceptions.
- **Zero unanswered questions at submit.** There is no negative marking — a blank scores 0, a 4-option guess scores 25% in expectation. Roughly 50 blind guesses is ~12 marks, which is over a quarter of the entire Paper II target. This 15-minute block is not optional.

**`CIL-014` — Post-exam calibration** · 2026-08-25 · Priority: Medium
- Record the actual score against the 117 target
- Apply the decision matrix below
- Decide: commit to a full cycle, or close this thread

### Decision matrix (attach to `CIL-014`)

Set this before the exam so the 25th is not spent rationalising.

| Actual score | Read | Action |
|---|---|---|
| 135+ | Retained far more than modelled | 400 hours to a competitive score is well-supported — commit to a full cycle |
| 115–135 | On model; the gap is hours, not aptitude | Full cycle is reasonable **if** the payoff still appeals after comparing the 5-year bond and coalfield posting against current career targets |
| 95–115 | Slower rebuild than modelled | Budget 500+ hours, not 400 |
| Below 95 | The 6-year gap is deeper than a formula refresh fixes | Weigh hard against simply pushing the data career |

### Degradation protocol (attach to the project, not a task)

If hours are lost, cut in this exact order:

1. `CIL-007` Strength of Materials (5 hrs)
2. `CIL-006` Fluid Mechanics (5 hrs)
3. Trim `CIL-005` Engineering Materials revision from 2 hrs to 1 hr

**Never cut:** `CIL-002`, `CIL-003`, `CIL-004` (the Manufacturing and Materials blocks), `CIL-010` (the mock), or `CIL-011` (Sunday consolidation).

*Rationale: recognition-level familiarity with FM and SOM degrades fastest under time pressure and contributes the least reliable marks. Recall-based Materials and Manufacturing content holds up. When the Paper II buffer is only 5 marks, reliability matters more than expected value.*

### Estimate provenance — flag this in the project notes

Two classes of number appear above and they should not be treated alike.

**Verified:** exam date, timings, reporting time, centre city, paper structure, no negative marking, category-wise qualifying floors, 145 Mechanical vacancies, 38,778 Mechanical applications received.

**Modelled — my estimates, not published figures:** the per-topic mark projections, the 117 combined target, the 62-hour budget, the no-show rate assumption behind the competition ratio, and the decision-matrix bands. These are defensible but they are estimates. Do not present them in the UI as though they were official.

---

## Expected output from the agent

1. The field-mapping table from Phase 1, before any writes.
2. A diff of everything created or changed.
3. The read-back project tree with per-day hour sums and the 62-hour total confirmed.
4. Test suite result.
5. A short list of anything in this document that did not fit the schema.
