# TraceRoot System Architecture

**Product**: TraceRoot AI-Assisted Root Cause Analysis Workspace  
**Domain**: Active Pharmaceutical Ingredient (API) Manufacturing Deviations  
**Regulatory Standards**: Compliant with principles of ICH Q7, ICH Q9(R1), ICH Q10, WHO TRS 986, 21 CFR Part 11  

---

## 1. Overview & System Purpose

TraceRoot is a purpose-built workspace for pharmaceutical API investigators facing complex deviations (e.g., Out-of-Specification impurities, crystallizer thermal excursions, yield loss). Rather than operating as an ungrounded conversational chatbot, TraceRoot functions as an **evidentiary extraction, deductive reasoning, and draft population copilot**.

The system enforces strict epistemological separation:
- **Observed Events & Physical Telemetry**: Objective empirical records (SCADA DCS logs, GC/HPLC chromatograms).
- **Reported Claims**: Subjective operator/supervisor handover statements.
- **Hypotheses & 5 Whys**: Deductive proposals subject to investigator verification.
- **CAPA Recommendations**: Proposed corrective and preventive actions with mandatory effectiveness criteria.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             FRONTEND WORKSPACE                              │
│                                                                             │
│  ┌───────────────────────┐  ┌────────────────────────────────────────────┐  │
│  │   Navigation / List   │  │           RCA Investigation Draft          │  │
│  │  - Open Deviations    │  │  - Incident Summary (Provenance Badges)    │  │
│  │  - Version Indicators │  │  - Empirical Evidence vs Contradictions    │  │
│  │  - Status: DRAFT /    │  │  - 5 Whys Deductive Chain                  │  │
│  │    REVIEWED           │  │  - Potential Causes (Categorical Strength) │  │
│  └───────────────────────┘  │  - CAPA Matrix (Accept / Reject)          │  │
│                             └────────────────────────────────────────────┘  │
│                                                   ▲                         │
│                                                   │ Auto-Populate & Edit    │
│  ┌────────────────────────────────────────────────┴──────────────────────┐  │
│  │                       AI Evidence Assistant Panel                     │  │
│  │  - Intake Tabs: PDF Upload / Paste Incident Text / Paste Email        │  │
│  │  - Synthetic Pharmaceutical Sample Selector                           │  │
│  │  - Real-Time Execution Telemetry & Stage Indicators                   │  │
│  │  - Excerpt Verification Modal with Verbatim Source Snippets           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST API (JSON / Multipart)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FASTAPI BACKEND SERVICE                          │
│                                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────────┐  │
│  │   Source Intake Engine  │  │        LangGraph Orchestration Graph     │  │
│  │  - PDF Header / Sig     │  │  START                                   │  │
│  │  - Whitespace Clean     │  │   │                                      │  │
│  │  - Scanned Density Test │  │  ┌▼────────────────────────┐             │  │
│  │  - Deterministic Segs   │  │  │ prepare_source          │             │  │
│  │  - SHA-256 Hashing      │  │  └┬────────────────────────┘             │  │
│  └─────────────────────────┘  │  ┌▼────────────────────────┐             │  │
│                               │  │ extract_incident        │             │  │
│  ┌─────────────────────────┐  │  └┬────────────────────────┘             │  │
│  │  Evidence Verifier      │  │  ┌▼────────────────────────┐             │  │
│  │  - In-Segment Matching  │  │  │ analyze_evidence        │             │  │
│  │  - Quote Normalization  │  │  └┬────────────────────────┘             │  │
│  │  - Verification Flags   │  │  ┌▼────────────────────────┐             │  │
│  └─────────────────────────┘  │  │ propose_investigation   │             │  │
│                               │  └┬────────────────────────┘             │  │
│  ┌─────────────────────────┐  │  ┌▼────────────────────────┐             │  │
│  │  Concurrency & Lock     │  │  │ propose_capa            │             │  │
│  │  - Run Lock (409)       │  │  └┬────────────────────────┘             │  │
│  │  - Optimistic Versioning│  │  ┌▼────────────────────────┐             │  │
│  │  - Auto-Revert to DRAFT │  │  │ validate_output         │             │  │
│  └─────────────────────────┘  │  └┬────────────────────────┘             │  │
│                               │  END                                     │  │
│                               └───────────────────┬──────────────────────┘  │
└───────────────────────────────────────────────────┼─────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERSISTENCE LAYER (SQL)                           │
│                                                                             │
│  - Engine: SQLAlchemy 2.0 Async (PostgreSQL primary / SQLite dev parity)   │
│  - Migrations: Alembic versioned migrations (001_initial, 002_persistent)   │
│  - Tables:                                                                 │
│    * `investigations`: Header fields, status, version, structured JSON      │
│    * `source_documents`: Raw extracted text, deterministic segments, hash   │
│    * `ai_runs`: Audit trail of model runs, input version, timings, stages   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Source Intake & Deterministic Segmentation

### Supported Input Channels
1. **Selectable-Text PDF**: Upload via `multipart/form-data`.
2. **Pasted Incident Text**: Direct input of operator shift handover logs or LIMS exports.
3. **Pasted Email**: Informal shift supervisor communications with optional sender, date, and subject headers.

### Finite Intake Limits
- **Maximum File Size**: 15 MB (`MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024`).
- **Maximum PDF Pages**: 40 pages (`MAX_PDF_PAGES = 40`).
- **Maximum Extracted Characters**: 32,000 characters (`MAX_EXTRACTED_CHARS = 32000`).
- **Filename Sanitization**: Uploaded filenames are stripped of path components (`os.path.basename`) and restricted to `[a-zA-Z0-9_.-]`. File contents are parsed entirely in memory without writing unsanitized files to disk.

### Scanned PDF Policy (No Fake Success)
Image-only/scanned PDFs that lack an embedded text layer are detected via a character density check:
$$\text{Density} = \frac{\text{Total Extracted Printable Characters}}{\text{Total Page Count}}$$
If $\text{Density} < 30 \text{ chars/page}$, the backend rejects the file with an explicit `HTTP 422 Unprocessable Entity`:
> *"The uploaded PDF appears to be a scanned document or image without selectable text. TraceRoot requires selectable-text PDFs to ensure evidentiary quote accuracy. Please supply an electronic record or paste the text directly."*

The system never hallucinates OCR text or pretends extraction succeeded.

### Deterministic Evidence Segmentation
Every document is parsed into immutable segments:
- **Segment ID Structure**: `seg-{page_number}-{paragraph_index}`.
- **Normalization**: Unicode NFC normalization, elimination of carriage return anomalies (`\r\n` $\rightarrow$ `\n`), and collapse of repeated blank lines.
- **Content Integrity**: Each document receives a SHA-256 content hash (`content_hash`) calculated from the normalized text.

---

## 3. LangGraph Orchestration & State Machine

TraceRoot orchestrates AI processing using a 6-node deterministic LangGraph state machine ([`backend/app/services/langgraph_rca.py`](file:///c:/documentsOfMine/TraceRoot/backend/app/services/langgraph_rca.py)).

### Graph State Structure (`RCAState`)
```python
class RCAState(TypedDict):
    investigation_id: str
    source_type: str
    source_text: str
    segments: list[dict[str, Any]]
    completed_stages: list[str]
    extracted_metadata: dict[str, Any]
    evidence_assessment: dict[str, Any]
    five_whys: list[dict[str, Any]]
    potential_causes: list[dict[str, Any]]
    contributing_factors: list[dict[str, Any]]
    evidence_gaps: list[dict[str, Any]]
    capa_suggestions: list[dict[str, Any]]
    errors: list[str]
```

### Stage Responsibilities & Transitions

1. **`prepare_source`**:
   - Validates character volume and segmentation integrity.
   - Formats segments into referenceable prompts with explicit `[Segment ID]` markers.

2. **`extract_incident`**:
   - Extracts core incident fields: Product name, batch number, equipment, manufacturing stage, observed deviation, expected condition, actual condition, and immediate containment.
   - **Grounding Rule**: Values not explicitly affirmed in the source remain `null` / `UNKNOWN`. The model is instructed never to infer or fabricate batch numbers, equipment IDs, or analytical results.

3. **`analyze_evidence`**:
   - Epistemological classification: Distinguishes **Observed Facts** (SCADA sensor logs, HPLC peaks) from **Reported Claims** (subjective shift handover comments).
   - Contradiction Detection: Cross-references conflicting statements (e.g., operator human-error allegation vs. SCADA instrument air pressure drop).
   - Missing Evidence Identification: Explicitly catalogs absent records (e.g., missing condenser cooling water delta-T).

4. **`propose_investigation`**:
   - Proposes 5 Whys deductive chain. Stops deductive progression and sets `is_unresolved: true` when physical evidence runs out, refusing to force an unsupported root cause.
   - Categorizes potential causes using 6M Ishikawa domains (Machine, Material, Method, Measurement, Man, Environment).
   - Assigns categorical evidence strength (`LIMITED`, `MODERATE`, `STRONG`) and defines next physical verification steps.

5. **`propose_capa`**:
   - Generates targeted Corrective Actions (eliminating root cause) and Preventive Actions (systemic process safeguards).
   - **Mandatory Referential Integrity**: Every CAPA recommendation must explicitly reference a valid `related_cause_id`.
   - **Mandatory Effectiveness Criteria**: Every CAPA requires a measurable verification test and timeframe (ICH Q10 §3.2.2).

6. **`validate_output`**:
   - Runs deterministic quote verification against raw source segments.
   - Validates schema conformance against `AIRunOutputContract`.

---

## 4. Groq Integration & Structured Output

- **Model**: `llama-3.3-70b-versatile` (configurable via `GROQ_MODEL`).
- **Temperature**: `0.1` (low variance for analytical reproducibility).
- **Format Enforcement**: JSON mode with strict Pydantic schemas.
- **Provider Resilience**:
  - `AuthenticationError` (401/403): Fast-exit with actionable administrative alert; no futile retries.
  - Rate Limits & Transient Outages (429/503): Exponential backoff with random jitter across 3 attempts.
  - Complete Provider Outage: Clean error reporting without silent fake-success fallback.

---

## 5. Evidence Verification Engine

To prevent fabricated citations, TraceRoot executes algorithmic quote verification before presenting results to the investigator:

1. For each `source_reference` containing a `quote` and `segment_id`:
   - Retrieve the exact segment text from the stored `SourceDocument`.
   - Normalize whitespace on both the quote and the segment text.
   - Verify substring inclusion: $\text{quote} \subseteq \text{segment\_text}$.
2. If the quote matches, the reference is flagged `verified: true` and rendered with a green citation badge.
3. If the quote cannot be verified in the target segment, it is flagged `verified: false` (`evidence_status: INFERRED`), and the UI warns the reviewer that the citation requires manual corroboration.

---

## 6. Draft Merging & Human-Edit Protection

A critical failure mode of AI-assisted workspaces is clobbering human edits when re-running analysis. TraceRoot prevents this through a **provenance tracking and proposal architecture**:

### Provenance State (`FieldProvenance`)
Every field in the investigation maintains metadata:
```json
{
  "value": "Residual THF measured at 0.82% w/w",
  "origin": "AI",
  "review_state": "UNREVIEWED",
  "source_references": ["seg-1-2"],
  "evidence_status": "SUPPORTED"
}
```

### Protection Rules
1. **Human Override Immobility**: When a user edits a field, the frontend immediately dispatches `updateField`:
   - `origin` transitions from `'AI'` to `'HUMAN'`.
   - `review_state` transitions to `'EDITED'`.
   - Misleading AI citation badges are stripped from the edited field.
2. **Re-Analysis Non-Destructive Merging**:
   - If an investigator re-runs AI analysis on updated sources, fields with `origin === 'HUMAN'` are **never overwritten**.
   - Instead, the AI's new recommendation is stored in `content.human_edit_proposals[field_name]`.
   - The UI displays an alert showing the current investigator value alongside the AI's proposed value, allowing the investigator to explicitly Accept or Dismiss the proposal.
3. **Persisted Rejection Memory**:
   - When a user rejects a suggested cause or CAPA, the decision is recorded in `content.human_review_decisions`. Subsequent runs respect the rejection and do not resurrect discarded suggestions.

---

## 7. Review Semantics & Concurrency Control

### Draft vs. Reviewed Lifecycle
- **DRAFT**: Investigations can be saved at any stage, even with incomplete data, open hypotheses, or unreviewed AI proposals.
- **REVIEWED**: Finalizing an investigation requires explicit review decisions:
  - Every AI field must be marked `ACCEPTED` or `EDITED`.
  - Every potential cause must be assigned a deliberate conclusion (`VERIFIED` or `RULED_OUT` with reviewer name and rationale).
  - Attempting to mark reviewed with unreviewed items returns HTTP 422 with an itemized completeness breakdown.
- **Automatic Status Reversion**: If a user modifies any field of an investigation in `REVIEWED` status, the backend immediately and automatically reverts the status to `DRAFT`. An investigation cannot retain a "Reviewed" stamp after post-review tampering.

### Optimistic Concurrency Control (409 Conflict Handling)
- Investigations maintain an integer `version` incremented on every save.
- All `PATCH /investigations/{id}` requests send the client's current version in the payload.
- If two browser tabs or investigators attempt to save competing edits:
  1. The second save is rejected with `HTTP 409 Conflict`.
  2. The frontend catches the 409 and displays the **Conflict Recovery Modal**.
  3. The investigator's local in-memory edits are preserved intact.
  4. The investigator can choose to:
     - **Overwrite**: Force save local version over remote.
     - **Save as New Copy**: Clone local edits into a new investigation number.
     - **Reload Server Version**: Discard local draft and load latest remote state.

---

## 8. Database Architecture & Alembic Versioning

TraceRoot uses SQLAlchemy 2.0 Async with a dual-database design:
- **Primary Production Engine**: PostgreSQL (`postgresql+psycopg://...`).
- **Development Parity Engine**: SQLite (`sqlite+aiosqlite:///./traceroot.db`) with `PRAGMA foreign_keys=ON` and `batch_alter_table` support in Alembic.

### Relational Schema
- **`investigations`**: Core audit headers (`id`, `investigation_number`, `title`, `status`, `product_name`, `batch_number`, `version`, `created_at`, `updated_at`) and structured analysis JSON (`content`).
- **`source_documents`**: One-to-many relationship with cascade delete (`id`, `investigation_id`, `source_type`, `display_name`, `extracted_text`, `segments`, `content_hash`).
- **`ai_runs`**: Historical audit trail (`id`, `investigation_id`, `draft_version`, `status`, `completed_stages`, `model_id`, `started_at`, `finished_at`).

### Migrations
- `001_initial_schema.py`: Base table structure.
- `002_persistent_contracts.py`: Persistent contract columns, foreign key indices, and versioning.

---

## 9. Architectural Tradeoffs & Future Enhancements

| Design Decision | Chosen Tradeoff | Rationale | Planned Next Step |
|---|---|---|---|
| **Scanned PDF Handling** | Deterministic rejection over local OCR | Bundling Tesseract/OCR creates large binary bloat, slow response times, and high hallucination risk on handwritten records. | Implement dedicated asynchronous OCR worker microservice with confidence heatmaps. |
| **Analysis Task Management** | In-process asyncio background task | Avoids Redis/Celery dependency overhead for evaluation deployment while providing concurrent run locking. | Migrate to Celery / Temporal queue for multi-replica horizontal clustering. |
| **Data Model Structure** | Hybrid relational headers + JSON document body | Balances high-speed SQL indexing on audit fields (status, batch, version) with rapid schema evolution for complex 5 Whys and Ishikawa trees. | Add PostgreSQL `JSONB` path indexing for deep querying across historical root cause categories. |
| **LLM Provider** | Groq (`llama-3.3-70b-versatile`) | Delivers sub-3-second end-to-end multi-stage graph completion, essential for real-time investigator UI workflows. | Implement fallback provider routing (e.g., Anthropic Claude / local vLLM). |
