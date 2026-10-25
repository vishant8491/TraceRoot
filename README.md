# TraceRoot: AI-Assisted Root Cause Analysis Workspace for API Manufacturing

**TraceRoot** is a specialized Root Cause Analysis (RCA) investigation workspace engineered for pharmaceutical Active Pharmaceutical Ingredient (API) manufacturing deviations. Informed by **FDA Q7** (GMP Guidance for APIs), **ICH Q9(R1)** (Quality Risk Management), and **ICH Q10** (Pharmaceutical Quality System / CAPA), TraceRoot transitions investigators from manual documentation to an AI-assisted evidentiary analysis workflow.

---

## 1. Purpose and Scope

In commercial API synthesis and isolation, investigations into deviations (e.g., Out-of-Specification HPLC impurity peaks, drying vacuum excursions, yield loss) often suffer from confirmation bias, slow manual transcription, or premature attribution to "operator error."

TraceRoot solves this by pairing the investigator with an **evidentiary AI assistant**:
- Ingests raw batch logs, SCADA historian extracts, and shift emails.
- Extracts empirical parameters and classifies statements into **Observed Facts** vs **Reported Claims**.
- Deduces candidate 5 Whys progression and 6M Ishikawa causes, stopping and highlighting **Missing Evidence Gaps** when data runs out.
- Recommends actionable Corrective and Preventive Actions (CAPA) with mandatory verification metrics.
- Preserves all human edits non-destructively, preventing AI re-runs from clobbering investigator conclusions.

> [!WARNING]
> **Regulatory Notice & Disclaimer**: TraceRoot is an engineering evaluation platform designed to demonstrate modern AI-assisted RCA workflows under GMP principles. It **does not claim official FDA/EMA certification, 21 CFR Part 11 electronic signature validation, or production-grade GMP qualification**. All outputs are proposed as draft recommendations subject to human quality unit review.

---

## 2. Mandatory Technology Stack

| Layer | Technology | Exact Version / Spec | Role in TraceRoot |
|---|---|---|---|
| **Frontend Framework** | React 18 + TypeScript | React `^18.3.1`, TypeScript `~5.5.3` | Type-safe investigation workspace and responsive review UI |
| **State Management** | Redux Toolkit (RTK) | `@reduxjs/toolkit` `^2.2.8`, `react-redux` `^9.1.2` | Manages active investigation draft, provenance badges, dirty state, and AI workflow telemetry |
| **Styling** | Vanilla CSS / CSS Tokens | Modern CSS Custom Properties | Purpose-built pharmaceutical aesthetic (warm off-white, deep navy text, restrained teal accents, amber warnings) |
| **Backend Framework** | Python 3.12 + FastAPI | FastAPI `0.110.0`, Pydantic V2 `^2.7.0` | Asynchronous REST API, strict request/response contracts, and multipart upload handlers |
| **AI Orchestration** | LangGraph + Groq | LangGraph `0.0.38`, Groq SDK `0.5.0` | 6-stage deterministic state graph utilizing `llama-3.3-70b-versatile` |
| **Persistence / ORM** | PostgreSQL + SQLAlchemy 2.0 | SQLAlchemy `2.0.29`, asyncpg / psycopg | Async SQL engine with relational audit headers, JSON document storage, and foreign key cascades |
| **Database Migrations**| Alembic | Alembic `1.13.1` | Versioned migration scripts (`001_initial_schema`, `002_persistent_contracts`) |

---

## 3. Environment Configuration

All environment variables are managed via `.env` files. Template files are provided at `backend/.env.example` and `frontend/.env.example`.

### Backend Environment Variables (`backend/.env`)

| Variable | Type | Default Value | Description |
|---|---|---|---|
| `APP_NAME` | string | `TraceRoot RCA Workspace` | Human-readable application title |
| `APP_ENV` | string | `development` | Environment mode (`development` or `production`) |
| `API_V1_PREFIX` | string | `/api/v1` | Root routing prefix for REST endpoints |
| `DEBUG` | boolean | `true` | Enables verbose FastAPI debug logging |
| `GROQ_API_KEY` | string | *(your secret key)* | Groq API key for live LLM inference (server-side only) |
| `GROQ_MODEL` | string | `llama-3.3-70b-versatile` | Target Groq model identifier |
| `DATABASE_URL` | string | `postgresql+psycopg://postgres:postgres@localhost:5432/traceroot` | Primary PostgreSQL async connection string |
| `CORS_ORIGINS` | JSON list | `["http://localhost:5173", "http://127.0.0.1:5173"]` | Permitted browser origins |

> [!NOTE]
> **Zero-Setup Database Parity**: If a local PostgreSQL instance is not listening on port 5432, TraceRoot automatically falls back to SQLite (`sqlite+aiosqlite:///./traceroot.db`) while maintaining 100% schema, async session, and constraint parity.

### Frontend Environment Variables (`frontend/.env`)

| Variable | Type | Default Value | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | string | `/api/v1` | Relative API prefix proxied to FastAPI backend |

---

## 4. Finite Limits & Supported Input Formats

TraceRoot enforces strict input limits to protect system stability and prevent silent source truncation:

| Parameter | Supported Limit | Enforcement Mechanism |
|---|---|---|
| **Max File Upload Size** | **15 MB** | Pre-stream byte count validation |
| **Max PDF Page Count** | **40 Pages** | `pypdf` page counter; rejects with HTTP 422 if exceeded |
| **Max Extracted Characters** | **32,000 Characters** | String length check prior to LangGraph dispatch |
| **Supported Formats** | PDF, Plain Text, Email | Explicit format parsers with deterministic segmentation |
| **Scanned / Image PDFs** | **Rejected (HTTP 422)** | Density check ($< 30\text{ chars/page}$). System explicitly requests selectable text rather than hallucinating fake OCR. |
| **Filename Sanitization** | `[a-zA-Z0-9_.-]` | Strips directory paths (`os.path.basename`) and neutralizes path traversal |

---

## 5. Installation & Setup Guide

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.11 or v3.12
- **PostgreSQL**: v14+ (optional for local evaluation; SQLite fallback is built-in)

### Step 1: Backend Setup
```bash
# 1. Navigate to backend directory
cd backend

# 2. Create and activate Python virtual environment
python -m venv .venv
.\.venv\Scripts\activate       # Windows PowerShell / CMD
# source .venv/bin/activate    # Linux / macOS

# 3. Install pinned dependencies
pip install -r requirements.txt

# 4. Create local .env from template
cp .env.example .env
# Edit .env to add your GROQ_API_KEY if testing live LLM inference
```

### Step 2: Database Initialization & Migrations
```bash
# If using PostgreSQL:
# 1. Create database in psql:
#    CREATE DATABASE traceroot;

# 2. Execute Alembic migrations to head revision:
alembic upgrade head
```

### Step 3: Start Backend API Server
```bash
# Run FastAPI server on port 8000
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
*Health check endpoint will be available at `http://127.0.0.1:8000/api/health`.*

### Step 4: Frontend Setup & Dev Server
```bash
# In a new terminal window:
cd frontend

# 1. Install Node dependencies
npm install

# 2. Start Vite development server
npm run dev
```
*Access the workspace in your browser at `http://localhost:5173`.*

---

## 6. API Endpoint Overview

All endpoints are versioned under `/api/v1`:

| Method | Endpoint | Description | Status Codes |
|---|---|---|---|
| `GET` | `/health` | Health probe returning DB engine and configured AI model | 200 |
| `POST` | `/api/v1/investigations` | Creates a new RCA investigation draft | 201 |
| `GET` | `/api/v1/investigations` | Lists investigations with version, status, and summary | 200 |
| `GET` | `/api/v1/investigations/{id}` | Fetches complete investigation including sources and analysis | 200, 404 |
| `PATCH` | `/api/v1/investigations/{id}` | Updates draft; enforces optimistic concurrency via version check | 200, 404, 409 |
| `POST` | `/api/v1/investigations/{id}/sources` | Ingests PDF upload, pasted text, or email with segmentation | 201, 422 |
| `POST` | `/api/v1/investigations/{id}/analyze` | Triggers LangGraph multi-stage execution | 200, 409, 502 |
| `POST` | `/api/v1/investigations/{id}/review` | Validates completeness and marks investigation `REVIEWED` | 200, 422 |

---

## 7. AI Orchestration & Epistemological Workflow

TraceRoot coordinates processing across 6 deterministic LangGraph nodes ([`backend/app/services/langgraph_rca.py`](file:///c:/documentsOfMine/TraceRoot/backend/app/services/langgraph_rca.py)):

```
START ──> [prepare_source] ──> [extract_incident] ──> [analyze_evidence] 
      ──> [propose_investigation] ──> [propose_capa] ──> [validate_output] ──> END
```

1. **`prepare_source`**: Formats normalized segments (`seg-{page}-{idx}`) with stable ID markers.
2. **`extract_incident`**: Populates core deviation fields. Absent fields remain `null`/`UNKNOWN`.
3. **`analyze_evidence`**: Separates **Observed Facts** (SCADA logs) from **Reported Claims** (supervisor shift comments), detects contradictions, and catalogs evidence gaps.
4. **`propose_investigation`**: Builds 5 Whys deduction; stops with `is_unresolved: true` when data is missing. Categorizes potential causes with categorical strength (`LIMITED`, `MODERATE`, `STRONG`).
5. **`propose_capa`**: Proposes Corrective and Preventive actions. Enforces referential integrity to `related_cause_id` and requires measurable effectiveness criteria (ICH Q10 §3.2.2).
6. **`validate_output`**: Algorithmically verifies citations against raw segment text.

### How AI Results Populate Redux & Protect Human Edits
- Every field tracks provenance: `{ origin: 'AI' | 'HUMAN', review_state: 'UNREVIEWED' | 'EDITED' | 'ACCEPTED' }`.
- When an investigator modifies a field, `origin` transitions to `'HUMAN'`, and misleading AI citation badges are stripped.
- Re-running AI analysis **never overwrites human edits**. Alternative suggestions are stored in `human_edit_proposals` for manual review.
- Modifying any field of an investigation in `REVIEWED` status automatically reverts its status to `DRAFT`.

---

## 8. Automated Test Execution & Verification

All test suites were executed on the active repository with zero mocked successes:

### Backend Pytest Suite (`pytest backend/tests/ -v`)
```text
34 passed, 1 skipped in 13.60s
- PDF Signature, Corrupt Stream, Encryption, & Scanned Rejection: PASSED
- Deterministic Segmentation & Quote Verification: PASSED
- Optimistic Concurrency Control (409 Conflict): PASSED
- Auto-Revert Reviewed Status on Modification: PASSED
- 6-Stage LangGraph Execution & Backoff Retry: PASSED
- 3 Synthetic Demo Scenarios (Missing Telemetry, Sparse Email, SCADA Conflict): PASSED
- Real-Provider Live Groq Smoke Test: SKIPPED (properly isolated when key is absent)
```

### Frontend React Testing Library Suite (`npm test`)
```text
8 passed in 24.76s
- Incident summary AI provenance & citation chips: PASSED
- Field edit provenance transition & citation badge clearing: PASSED
- Citation chip modal opening with verbatim quote verification: PASSED
- Potential causes categorical strength & deliberate conclusions: PASSED
- CAPA matrix Accept/Reject review state: PASSED
- Review modal unreviewed item validation: PASSED
- 409 Conflict Recovery Modal local edit preservation: PASSED
- AI Assistant input tabs & synthetic data selector: PASSED
```

### Static Typecheck & Production Bundle
- `npx tsc --noEmit`: Exits with code `0` (Zero TypeScript errors).
- `npm run build`: Built production bundle `dist/` in 23.38s with zero warnings/errors.

---

## 9. Known Limitations

1. **Local PostgreSQL Connectivity**: The local Windows host environment uses the transparent SQLite async fallback (`traceroot.db`) because no local PostgreSQL server is active on port 5432. All ORM models and Alembic migrations are written for PostgreSQL and maintain 100% schema parity.
2. **Scanned PDF OCR**: Scanned image PDFs are rejected with HTTP 422 to prevent OCR hallucination. Future iterations will include an asynchronous OCR pipeline with confidence scoring.
3. **Live Groq API Key**: Live LLM calls require configuring `GROQ_API_KEY` in `backend/.env`. In offline/mock mode, the deterministic test suite validates all graph stages and contracts.

---

## 10. Documentation Index

- **Architecture Deep-Dive**: [`docs/ARCHITECTURE.md`](file:///c:/documentsOfMine/TraceRoot/docs/ARCHITECTURE.md)
- **Release QA & Traceability Report**: [`docs/QA_REPORT.md`](file:///c:/documentsOfMine/TraceRoot/docs/QA_REPORT.md)
- **Video Scripts & Interview Cheat-Sheet**: [`docs/VIDEO_SCRIPTS.md`](file:///c:/documentsOfMine/TraceRoot/docs/VIDEO_SCRIPTS.md)
- **FDA Q7 & ICH Q10 Domain Foundations**: [`docs/DOMAIN_NOTES.md`](file:///c:/documentsOfMine/TraceRoot/docs/DOMAIN_NOTES.md)
