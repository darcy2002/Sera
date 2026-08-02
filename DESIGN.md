# Medical-Bill Auditor — Design & Plan

> Upload an itemized US medical bill (and optionally an insurance EOB). The system extracts every
> line item, runs an error-detection engine over it, estimates how much you were likely overcharged,
> and drafts the appeal letter.

**Status:** Planning · **Owner:** Rohit-inspired portfolio project · **Started:** 2026-08-02

---

## 1. Why this exists

~80% of itemized US medical bills contain errors, and most people simply pay them. This tool turns a
confusing, high-stakes document into: *"here are 3 likely errors, here's the ~$340 you may be owed,
here's the appeal letter — ready to send."*

**Goals**
1. Genuinely useful, live, demoable product with a clear "wow" moment.
2. Deep enough technical decisions to carry a senior-level interview.
3. Near-$0 to run (free tiers + public datasets), architected as if it scales.

**Non-goals (for now):** legal/medical advice, being a system of record for PHI, insurer integrations,
mobile apps.

---

## 2. Target user & positioning

- **User:** a US patient (or a patient advocate) who just got a surprise/large bill.
- **Positioning:** "Snap your bill, find the errors, send the appeal." Consumer-simple UX over a
  genuinely technical engine.

---

## 3. Core user flow

```
Upload bill (PDF/photo) ──▶ Extract line items ──▶ Run audit engine ──▶ Findings report ──▶ Draft appeal
   (+ optional EOB)          (OCR + LLM)           (rules + LLM)        ($ overcharged)     (download/email)
```

**Demo money-shot:** a streaming progress screen —
`Parsed 14 line items → checking duplicates → comparing to Medicare rates → found $340 across 3 issues.`

---

## 4. Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  Next.js    │────▶│  FastAPI     │────▶│  Redis queue        │
│  (frontend) │◀────│  (API)       │◀────│  + async worker     │
└─────────────┘     └──────┬───────┘     └──────────┬──────────┘
                           │                        │
                           ▼                        ▼
                    ┌────────────┐          ┌────────────────────┐
                    │ Postgres   │          │ Pipeline:          │
                    │ - jobs     │          │ 1 OCR / parse      │
                    │ - findings │          │ 2 normalize → code │
                    │ - ref data │◀─────────│ 3 rule engine      │
                    │  (Medicare,│          │ 4 LLM reasoning    │
                    │   NCCI)    │          │ 5 appeal draft     │
                    └────────────┘          └─────────┬──────────┘
                           ▲                          │
                    ┌──────┴──────┐            ┌───────▼──────┐
                    │ Object store│            │ LLM API      │
                    │ (encrypted, │            │ + OCR service│
                    │  short TTL) │            └──────────────┘
                    └─────────────┘
```

Analysis is **async**: upload returns a `job_id`, a worker processes the pipeline, the frontend polls
(or subscribes via SSE) for progress and results. OCR + LLM take 10–40s, so nothing blocks a request.

---

## 5. The audit engine (the heart of the product)

**Hybrid: deterministic rules for anything provable, LLM only where judgment is needed.** This is the
key differentiator — *not* "ask the LLM if the bill is wrong."

| Check | Type | How | Data needed |
|---|---|---|---|
| Duplicate charges | Rule | Same CPT + date billed twice | none |
| Unbundling | Rule | Codes billed separately that must be bundled | CMS **NCCI edit pairs** (public) |
| Above fair price | Rule | Charge ≫ reference rate | CMS **Medicare fee schedule** (public) |
| EOB vs bill mismatch | Rule | Provider bills more than EOB "patient responsibility" | uploaded EOB |
| Upcoding | LLM | Billed code more severe than documented service | LLM reasoning, flagged for review |
| Quantity / unit errors | Hybrid | Implausible units (e.g. 8 ER visits same day) | rules + LLM sanity check |
| Surprise / balance billing | Hybrid | Out-of-network charges banned by No Surprises Act | rules + LLM |

**The LLM's real jobs:** (a) *extraction* — messy PDF → structured line items; (b) *normalization* —
free-text description → CPT/HCPCS code (`pgvector` embeddings help match); (c) *judgment* on ambiguous
cases; (d) *writing the appeal*. Everything provable stays a rule.

---

## 6. Data model (sketch)

- `audit_job` — id, status, created_at, source_file_ref, ttl_expires_at
- `line_item` — job_id, raw_description, cpt_code, units, charge, service_date, normalized_confidence
- `finding` — job_id, line_item_id, type, severity, explanation, estimated_overcharge, confidence, source (rule|llm)
- `eob_line` — job_id, cpt_code, allowed_amount, patient_responsibility
- **Reference tables** (seeded from public data): `medicare_rate`, `ncci_edit_pair`, `cpt_reference`

---

## 7. Tech stack & rationale

| Layer | Choice | Why (also: the interview talking point) |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind | Streaming results UI; matches the job market |
| API | FastAPI (Python) | Async; right ecosystem for data/LLM work |
| DB | Postgres + pgvector | Jobs, findings, CMS reference data, embedding-based code matching |
| Queue/worker | Redis + TaskIQ (or Celery) | Async pipeline; don't block requests |
| Storage | S3-compatible (encrypted, short TTL) | Ephemeral PHI handling |
| LLM | Claude (+ fallback model) | Extraction, reasoning, appeal drafting; "multi-model fallback chain" |
| OCR | Hosted (Textract / Document AI) → self-hosted upgrade path | Note privacy tradeoff |

---

## 8. PHI / security (headline interview topic)

Medical bills are **PHI** — most candidates ignore this; addressing it sets you apart.

- **Ephemeral by default** — process, return results, purge the raw document (storage TTL). Don't be a
  PHI honeypot.
- **Redact before the LLM** — strip name / DOB / MRN / address before any external API call; the engine
  only needs codes, charges, dates.
- **Encryption** at rest and in transit; signed, expiring upload URLs.
- **BAA awareness** — real production needs a HIPAA-eligible LLM (e.g. Claude via Bedrock under a BAA).
  Knowing this exists is a differentiator.

---

## 9. Phased plan

Each phase is independently shippable and adds a concrete demo + talking point.

### Phase 0 — Foundations
Repo structure (monorepo: `apps/web`, `apps/api`), tooling, env config, this doc, a `Makefile`/scripts,
local Postgres + Redis via Docker Compose. **Deliverable:** `make dev` boots the whole stack.

### Phase 1 — Skeleton
Next.js ⇄ FastAPI wired up. Upload a file → create a `job` → worker sets it to "done" with dummy data →
frontend polls and renders. **Deliverable:** end-to-end plumbing with fake analysis.

### Phase 2 — Extraction (riskiest — prove early)
Real OCR + LLM → structured `line_item`s from a real bill PDF. **Deliverable:** upload a real sample
bill, get accurate line items back.

### Phase 3 — Reference data + rule engine
Seed the Medicare fee schedule into Postgres. Implement 3 checks: duplicates, fair-price-vs-Medicare,
EOB-vs-bill mismatch. **Deliverable:** real `finding`s with dollar estimates.

### Phase 4 — Findings UI (the money-shot)
Streaming progress + a clean findings report with total potential overcharge. **Deliverable:** the demo
screen that lands interviews.

### Phase 5 — Appeal generation
Templated + LLM-personalized appeal letter, downloadable. **Deliverable:** end-to-end value.

### Phase 6 — Polish + PHI hardening + deploy
Redaction, storage TTL, error states, a real sample-bill demo mode, deploy. **Deliverable:** live URL on
the resume.

### Phase 7+ — Later (roadmap / "what's next" in interviews)
Auth & accounts · credit-based billing · advanced checks (NCCI unbundling, upcoding) · audit history ·
self-hosted OCR · HIPAA-eligible LLM path.

---

## 10. What's needed from you (inputs & decisions)

**Content (blocks Phase 2):**
- [ ] A **sample itemized bill** to build against — real-but-redacted, a public example, or a synthetic
  one (I can generate a realistic synthetic bill + EOB to develop against).

**Accounts / API keys (mostly free tiers; needed around Phases 2–3 and 6):**
- [ ] **LLM API key** — Anthropic (or OpenRouter for multi-model). Pay-as-you-go, cents for dev.
- [ ] **Postgres** — Neon or Supabase free tier (or local Docker for dev).
- [ ] **Object storage** — Cloudflare R2 (no egress fees) or Supabase Storage.
- [ ] **OCR** — Google Document AI free tier, or start with a self-hosted OSS model ($0).
- [ ] **Hosting** — Vercel (frontend, free) + Render/Railway/Fly (backend, free/cheap) for Phase 6.

**Environment (already confirmed):** Node 22 + pnpm ✓, Python (for FastAPI — confirm version),
Docker (optional, for local Postgres/Redis).

**Decisions to confirm:**
- [ ] Monorepo (`apps/web` + `apps/api`) vs two separate repos.
- [ ] LLM provider (Anthropic direct vs OpenRouter).
- [ ] OCR path for dev (hosted free tier vs self-hosted OSS).

---

## 11. Cost plan (near-$0)

- Postgres: Neon/Supabase free · Storage: R2 free tier · Frontend: Vercel free · Backend: Render/Railway
  free tier · Public datasets (Medicare, NCCI): free · LLM: pay-as-you-go, a few dollars covers all of
  development. Only real cost is OCR at volume — mitigated by the self-hosted path.

---

## 12. Open questions

- Which state/region's pricing to reference first (Medicare is national; good enough for v1).
- How to source a realistic sample bill without touching real PHI (leaning synthetic for dev + demo).
