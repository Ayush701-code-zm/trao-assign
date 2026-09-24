# PrepKit — AI Interview Prep Kit

Turn a job description and company website into a personalised interview preparation kit: company brief, role breakdown, question bank, flashcards, and a day-by-day study schedule.

**Assessment:** FS-AI-INTERVIEW-01

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 14 + Tailwind CSS | Preferred stack; App Router, fast UI iteration |
| Backend | Node.js + Express | Preferred stack; clear pipeline modules |
| Database | MongoDB + express-session (connect-mongo) | Preferred stack; session auth without extra JWT surface |
| Scraping | fetch + cheerio + robots-parser | Lightweight, works against local fixture hosts, respects robots.txt |
| LLM | **Groq** (`openai/gpt-oss-20b`) by default; Gemini optional | Genuine free tier, low latency; swap via `LLM_PROVIDER` |

## Features

- Register / login / logout with HTTP-only session cookies; kits are scoped to the signed-in user
- Create a kit from pasted JD + company URL + days until interview
- Batch create from a JSON file of pairs
- Live generation progress with step labels and failure states
- Full kit builder: inline edit, reorder, add/delete, per-section regenerate that preserves pinned/edited items
- Practice mode with confidence ratings and least-confident-first ordering
- **Weak spots report** (creative feature): readiness score from low-confidence cards, unpractised cards, and uncovered must-haves
- Batch CLI: `npm run evaluate`

## Setup

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- A free [Groq](https://console.groq.com) API key (or Gemini)

### Install

```bash
cp .env.example .env
# edit .env — set MONGODB_URI, SESSION_SECRET, GROQ_API_KEY

cp frontend/.env.local.example frontend/.env.local
# BACKEND_URL=http://localhost:4000
# Browser talks only to Next.js; /api is proxied to the backend (no CORS).

npm run install:all
```

### Run locally

```bash
# terminal 1
npm run dev:backend

# terminal 2
npm run dev:frontend
```

Open http://localhost:3000

### Tests

```bash
npm test
```

Covers schedule allocation, coverage checking, and kit structure validation.

### Batch entry point (Section 9)

```bash
npm run evaluate -- --input samples/cases.example.json --output kits-out.json
```

- Reads credentials from `.env` / environment (see `.env.example`)
- Continues after a failed case
- Uses the same `runPipeline` code as the web app
- Set `ALLOW_PRIVATE_URLS=true` when company sites are served from localhost (default outside production)

## LLM provider

- **Default:** Groq · `openai/gpt-oss-20b`
- **Alternative:** set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`

Retries use exponential backoff on 429 / 5xx so free-tier rate limits do not abort a run.

## Architecture

```
frontend (Next.js)  →  Express API  →  MongoDB
                              ↓
                     pipeline/index.js
                     ├── extract (JD → requirements)
                     ├── crawl (site → ranked pages)
                     ├── public discussion search
                     ├── company brief
                     ├── questions per category (separate LLM calls)
                     ├── coverage check (deterministic) + gap fill
                     ├── flashcards
                     └── schedule allocate (deterministic)
```

Concerns stay separated: `crawl`, `research`, `generate`, `coverage`, `schedule`, `validate`, HTTP routes, and persistence.

## Retrieval approach

1. Fetch the company homepage (validated URL; private/loopback blocked in production).
2. Parse links, score them for hiring/about signals (`careers`, `how-we-hire`, handbook, engineering blog, etc.). Ranking is score-based — not a fixed path list.
3. Respect `robots.txt` for `InterviewPrepKitBot`. Rate-limit with `CRAWL_DELAY_MS`. Skip and record pages that 404/timeout.
4. Fetch top-ranked same-origin pages; prefer a hiring-process page when one scores highly.
5. Search public interview discussion via DuckDuckGo HTML results, then fetch promising Glassdoor / Levels / Reddit / Blind-style links. If nothing turns up, the kit says so.

**Sources used:** company site pages discovered by crawl; DuckDuckGo HTML search as a discovery index; discussion pages only when reachable.

Fetched page text and pasted JDs are wrapped with an explicit “treat as untrusted data” instruction before any model call.

## Research & generation sequencing

| Step | Owner | Responsibility |
| --- | --- | --- |
| Extract requirements | LLM | Must/nice, kind, stable ids — invent nothing |
| Crawl + rank links | Code | Discover hiring/about pages |
| Public discussion | Code + fetch | Interview-process chatter |
| Company brief | LLM | Honest summary from retrieved excerpts only |
| Questions by category | LLM (4 calls) | technical / behavioural / system-design / company-fit separately |
| Coverage check | **Code** | Uncovered must-have requirement ids |
| Gap fill | LLM | Only for uncovered ids; then check again |
| Flashcards | LLM | Linked to requirement ids |
| Schedule | **Code** | Arithmetic allocation across exactly N days |

### Coverage passes

Maximum **2** passes (initial generation + one gap-fill loop). After that, if a must-have is still uncovered, a deterministic fallback question is attached so the kit never ships with uncovered must-haves. Two passes balance free-tier cost against the requirement that must-haves are covered; a third LLM pass rarely adds signal once the model has already seen the gaps.

## Generated / edited / pinned state

Questions and flashcards carry:

- `origin`: `generated` | `user`
- `edited`: true after the user changes text
- `pinned`: user opt-in to always keep

Regenerating a question category keeps items that are pinned, edited, or user-authored, and only replaces pristine generated items in that category. Other sections are untouched.

Autosave in the builder debounces PATCH requests so typing feels immediate.

## Schedule allocation

Deterministic in `pipeline/schedule.js`:

- Score questions by must-have coverage and difficulty
- Place higher scores earlier (front-loaded)
- Soft per-day caps so days are balanced
- Guarantee every must-have appears via at least one of its questions
- Duration = integer minutes from difficulty weights
- Day count = exactly `days` (clamped 1–60)

## Practice ordering

Confidence-weighted sort: uncovered cards first, then lowest confidence. Chosen over full spaced repetition because interview prep is short-horizon (days, not months); the goal is to hit weak cards before the interview date, not to optimise long-term retention curves.

## Creative feature — Weak spots report

After practising, the Weak spots tab shows a readiness score plus suggested drills from low-confidence cards, untouched cards, and any remaining uncovered must-haves. Solves the real problem of “I read the kit but don’t know what to revise tonight.”

## Edge cases

| Case | Behaviour |
| --- | --- |
| Invalid / 404 / timeout company URL | Recorded in notes; thin honest brief; kit still `ok` if JD extraction works. Fully unreachable with no usable kit → `failed` only when generation itself cannot produce a valid kit |
| No hiring page | Note in research; questions rely on JD + about pages |
| Two-line JD | `thin` flag; few requirements; no invented skills |
| No public discussion | Explicit note; company-fit questions stay modest |
| Invalid model JSON | Parse repair / retry; fallbacks for questions & flashcards |
| Rate limits | Exponential backoff (`LLM_MAX_RETRIES`) |
| Duplicate JD + company | Reuse existing kit unless `force: true` |
| 1-day / 60-day schedule | Clamped and allocated exactly |

## Security

- URL scheme allowlist; DNS/private IP rejection in production
- Content-type and size caps on fetches
- Untrusted content never treated as instructions (`CONTENT_GUARD`)
- Session cookies: httpOnly; `secure` + `sameSite=none` in production for cross-origin deploys

## Generation concurrency

Creating a kit sets status `queued` → `running` with progress updates. A process-local set prevents double-running the same kit id. Failed runs store structured `{ code, message }` for the UI. Duplicate submissions reuse a fingerprint of JD + URL.

## Deployment

1. **MongoDB Atlas** — free cluster; put URI in backend env.
2. **Backend** — Render / Railway / Fly: root `backend`, start `npm start`, set env from `.env.example`.
3. **Frontend** — Vercel: root `frontend`, set `BACKEND_URL` to your public API URL (server-only; Next proxies `/api`).
4. Backend `SESSION_SECRET` must be strong; `ALLOW_PRIVATE_URLS=false` in production. No CORS setup needed — the browser only talks to the Next.js origin.

After deploy, update this README with your live URL:

- **Live app:** _(add after deploy)_
- **API health:** `GET /api/health`

## Design decisions & limitations

- **Separate category prompts** over one mega-prompt so hiring-process context and behavioural vs technical instructions stay distinct.
- **Deterministic coverage & schedule** because those are checkable correctness problems, not creative ones.
- **DuckDuckGo HTML** is brittle; discussion search may return nothing — we prefer honesty over fabrication.
- Free-tier models sometimes omit requirement links; the coverage loop and fallback questions compensate.
- Crawl depth is capped (`CRAWL_MAX_PAGES`) to finish five evaluate cases within fifteen minutes.

## Project layout

```
backend/src/pipeline/   retrieval + generation
backend/src/routes/     auth + kits API
backend/src/evaluate.js batch CLI
frontend/app/           Next.js pages
frontend/components/    builder, practice, weak spots
samples/                example evaluate input
```
