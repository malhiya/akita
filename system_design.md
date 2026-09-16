# Akita — System Design (v1)

## What Akita Is

Akita is an AI-powered pet care schedule generator. Users describe their
pets and tasks — either through a structured form or plain-English notes —
and Akita classifies, organizes, and generates a conflict-free calendar
they can view, adjust, share, and subscribe to from any calendar app.

Akita is a **generation tool, not a tracking tool.** It builds the
schedule; it does not track daily completion. Once generated, the schedule
lives in the user's own calendar via `.ics` subscription, where they can
mark things done using whatever app they already use.

---

## Scope

**v1 includes:**
- Multi-pet profiles with health context that feeds AI classification
- Dual input: structured form or freeform text, both producing the same
  task object
- AI-assisted classification via Groq (priority, category, reason) with
  visible fallback to keyword rules when the API fails
- Review/confirm step before tasks commit — shows AI reasoning
- AI-suggested conflict resolution when tasks overlap
- Calendar view with priority color coding, pet filtering, and
  drag-and-drop rescheduling
- Flexible date-range generation: quick presets (this week, next 2 weeks,
  this month, next 3 months) plus a custom date picker for any range
- Shareable read-only link with optional date-range and pet filters,
  plus a notes field for sitter instructions
- `.ics` subscription feed and one-off download
- Guided onboarding flow for first-time users
- Anonymous but persistent owners (no login, data survives refresh)

**Deferred to v2+:**
- Task completion tracking (requires a `task_completion` table for
  per-day state on recurring tasks — not needed for generation)
- Auth/accounts
- Owner time-budget scheduling
- Multi-caregiver edit access
- Notifications / reminders
- Learning from user corrections
- Species expansion beyond dogs/cats
- Safety validation against the knowledge base
- PDF export
- Batch-aware classification (per-line classification is simpler to
  error-handle and already proven in the existing codebase; time-slot
  deconfliction can happen deterministically after classification)

---

## System Diagram

```
┌───────────────────────────────┐
│         User (Browser)        │
│  - Structured form entry      │
│  - Freeform text entry        │
│  - Views calendar / shares    │
└───────────────┬────────────────┘
                │ HTTP (JSON)
                ▼
┌───────────────────────────────┐
│      React + Vite Frontend    │
│  - Guided onboarding flow     │
│  - FullCalendar view          │
│    (drag-and-drop enabled)    │
│  - Task form + text box       │
│  - Review/confirm step        │
│  - Share link + .ics UI       │
│  - Tailwind styling           │
│  - plain fetch (no query lib) │
└───────────────┬────────────────┘
                │ REST calls
                ▼
┌───────────────────────────────┐
│         FastAPI Backend       │
│  - Pydantic request/response  │
│    validation                 │
│  - Route layer                │
└───────────────┬────────────────┘
                │
      ┌─────────┼─────────────────────────────┐
      ▼         ▼                             ▼
┌───────────┐ ┌────────────────────┐   ┌───────────────────┐
│  Input    │ │  Retrieval (RAG)   │   │  Deterministic     │
│  Parser   │ │  - knowledge_base  │   │  Parser            │
│  - split  │ │  - keyword match   │   │  - duration regex  │
│    lines  │ │  - returns slice   │   │  - time regex      │
│  - pet    │ │  - pet health_notes│   │  - recurrence →    │
│    routing│ │    appended to     │   │    RRULE builder   │
│  (word-   │ │    context         │   │  - deconflict      │
│  boundary)│ └──────────┬─────────┘   │    default times   │
└─────┬─────┘            │             └─────────┬──────────┘
      │                  ▼                       │
      │         ┌────────────────────┐           │
      │         │   Groq API         │           │
      │         │   openai/gpt-oss-20b│          │
      │         │   JSON mode         │          │
      │         │   per-line call     │          │
      │         │   → priority/       │          │
      │         │     category/reason │          │
      │         │   falls back to     │          │
      │         │   keyword rules,    │          │
      │         │   flagged visibly   │          │
      │         └──────────┬─────────┘           │
      └───────────────────┬┴──────────────────────┘
                           ▼
                ┌────────────────────┐
                │  Review / Confirm  │
                │  "parsed as: ..."  │
                │  (shows reason)    │
                │  user accepts/     │
                │  edits/rejects     │
                └──────────┬─────────┘
                           ▼
                ┌────────────────────┐
                │     Scheduler      │
                │  - priority sort   │
                │  - conflict detect │
                │  - conflict → Groq │
                │    suggests a fix  │
                └──────────┬─────────┘
                           ▼
                ┌────────────────────┐
                │   SQLModel ORM     │
                │  ↓                 │
                │   SQLite (dev) /   │
                │   Supabase (prod)  │
                │  - Owners, Pets,   │
                │    Tasks, Share    │
                │    Tokens          │
                └──────────┬─────────┘
                           ▼
        ┌──────────────────┴───────────────────┐
        ▼                                       ▼
┌──────────────────┐                  ┌───────────────────┐
│  Calendar Render  │                  │  Export Layer     │
│  - RRULE expanded │                  │  - .ics feed       │
│    on demand      │                  │    (icalendar lib) │
│    (dateutil)     │                  │  - .ics download   │
│  - priority color │                  │  - share URL with   │
│    + label        │                  │    date/pet filters │
│  - drag-and-drop  │                  │    + sitter notes   │
│    rescheduling   │                  │    (nanoid)        │
│  - preset + custom│                  └───────────────────┘
│    date ranges    │
└──────────────────┘
```

---

## Tech Stack

| Layer          | Choice                                                        |
|----------------|------------------------------------------------------------------|
| Backend        | FastAPI + Pydantic                                                |
| AI classifier  | Groq API, `openai/gpt-oss-20b`, JSON mode                         |
| Recurrence     | RRULE strings, expanded via `dateutil.rrule`                      |
| Database       | SQLite locally during development, Postgres (Supabase) at deploy  |
| ORM            | SQLModel                                                          |
| Calendar export| `icalendar` — `.ics` subscription feed and one-off download        |
| Frontend       | React + Vite                                                      |
| Calendar UI    | FullCalendar (with drag-and-drop via `editable: true`)             |
| Styling        | Tailwind                                                           |
| Data fetching  | Plain `fetch` + `useState`/`useEffect`                              |
| Testing        | pytest                                                             |
| Hosting        | Render/Railway (API), Vercel/Netlify (frontend), Supabase (DB)      |

---

## API Routes

| Method | Path                         | Purpose                                    |
|--------|-------------------------------|--------------------------------------------|
| POST   | `/owners`                     | Create anonymous owner, return ID           |
| GET    | `/owners/{id}`                | Get owner profile                           |
| PATCH  | `/owners/{id}`                | Update owner name                           |
| DELETE | `/owners/{id}`                | Delete owner and all associated data        |
| POST   | `/owners/{id}/pets`           | Add a pet                                   |
| GET    | `/owners/{id}/pets`           | List owner's pets                           |
| PATCH  | `/pets/{id}`                  | Update pet details                          |
| DELETE | `/pets/{id}`                  | Delete pet and its tasks                    |
| POST   | `/parse`                      | Freeform text → classified task drafts      |
| POST   | `/tasks`                      | Commit a task (from form or confirmed draft)|
| PATCH  | `/tasks/{id}`                 | Edit task (including drag-and-drop moves)   |
| DELETE | `/tasks/{id}`                 | Delete a task                               |
| GET    | `/schedule?owner_id=&start=&end=` | RRULE-expanded occurrences for a range  |
| POST   | `/owners/{id}/share`          | Mint a share token (accepts optional notes, date range, pet filter) |
| GET    | `/share/{token}?start=&end=&pet_id=` | Read-only shared view, optionally filtered |
| GET    | `/share/{token}/feed.ics?start=&end=&pet_id=` | `.ics` feed, same optional filters |

---

## Notes

- **Generation, not tracking.** No `is_complete` column, no completion
  state, no daily checkboxes. The schedule is the deliverable. Users
  track completion in their own calendar app via the `.ics` subscription.
  A `task_completion` table is a clean v2 addition if needed.

- **Anonymous but persistent owners.** Each owner is a real database row
  with an ID stored in the browser. `user_id` column reserved (nullable)
  for v2 accounts.

- **Health notes feed the classifier.** A pet's `health_notes` field is
  appended to the KB context sent to Groq, so "give medication" resolves
  differently for a diabetic dog vs. a healthy one.

- **Drag-and-drop rescheduling.** FullCalendar's `editable: true` +
  `eventDrop` callback wired to `PATCH /tasks/{id}` — the calendar is
  interactive, not just a display.

- **Recurrence stored as RRULE.** Makes multi-month generation cheap and
  `.ics` export a near pass-through. The form shows simple dropdowns; a
  conversion function maps that to RRULE before storage.

- **Per-line classification, not batch.** Simpler error handling (one
  line fails, the rest still work). Default time-slot collisions are
  resolved deterministically after all classifications return, rather
  than relying on the LLM to coordinate.

- **Guided onboarding.** First-time users see a short flow: name → first
  pet → try typing tasks. Not a separate feature; conditional UI states
  on existing screens.

- **Owner reset.** `DELETE /owners/{id}` wipes all data for a fresh
  start — important for a no-login app with no "create new account"
  escape hatch.

- **AI model name in env var**, not hardcoded. Swapping models is a
  config change.

- **Visible fallback.** If Groq fails, the UI shows "used keyword
  matching" alongside the result.

- **Flexible date-range generation.** The schedule endpoint takes any
  `start` and `end` date — not just month boundaries. The UI offers
  quick presets (this week, next 2 weeks, this month, next 3 months)
  plus a custom date picker for arbitrary ranges like Aug 6–13.

- **Sitter-facing sharing.** Share links accept optional query params
  for date range and pet filter, so a sitter sees only the week they're
  covering and only the pets they're responsible for — not the owner's
  full calendar. The share token also carries an optional `notes` field
  (e.g. "Buddy's leash is by the door") displayed at the top of the
  shared view. The `.ics` feed respects the same filters.