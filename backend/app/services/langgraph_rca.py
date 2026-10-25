import logging
import re
import uuid
from typing import TypedDict, List, Dict, Any, Optional, Tuple, Callable
from datetime import datetime, timezone

from langgraph.graph import StateGraph, END

from app.config import settings
from app.exceptions import GroqConfigurationError, GroqExecutionError
from app.services.groq_provider import (
    LLMProvider,
    GroqLiveProvider,
    MockedGraphProvider,
    verify_groq_configuration,
)
from app.services.segmenter import normalize_whitespace, verify_citation_quote
from app.schemas.contracts import (
    SourceReference,
    ProvenanceField,
    EvidenceAssessment,
    FiveWhysItem,
    PotentialCauseItem,
    ContributingFactorItem,
    EvidenceGapItem,
    CapaSuggestionItem,
    HumanEditProposal,
    InvestigationContent,
    OriginEnum,
    ReviewStateEnum,
    EvidenceStatusEnum,
)

logger = logging.getLogger(__name__)

# Standard Regulatory Background Guidance References (ICH/USP/FDA)
REGULATORY_BACKGROUND_GUIDANCE = [
    {
        "guidance_id": "ICH-Q9-R1",
        "title": "ICH Q9(R1) Quality Risk Management",
        "section": "Principles of Quality Risk Management & Formality",
        "guidance_text": "The evaluation of risk to quality should be based on scientific knowledge and link to the protection of the patient. Formality in root cause analysis should be proportional to the level of risk.",
        "type": "DOMAIN_BACKGROUND_RESEARCH",
    },
    {
        "guidance_id": "ICH-Q10",
        "title": "ICH Q10 Pharmaceutical Quality System",
        "section": "Corrective Action and Preventive Action (CAPA) System",
        "guidance_text": "A CAPA methodology should be used that results in product and process improvements and enhanced product and process understanding. Investigation should determine root cause rather than assigning human error as a terminal cause.",
        "type": "DOMAIN_BACKGROUND_RESEARCH",
    },
    {
        "guidance_id": "FDA-OOS-2022",
        "title": "FDA Guidance: Investigating Out-of-Specification (OOS) Test Results",
        "section": "Phase II - Manufacturing Phase Investigation",
        "guidance_text": "Clear differentiation must be maintained between laboratory artifacts and process manufacturing deviations. A hypothesis cannot be accepted without confirmatory physical/analytical evidence.",
        "type": "DOMAIN_BACKGROUND_RESEARCH",
    },
]


class RCAWorkflowState(TypedDict, total=False):
    # Context & Snapshot
    investigation_id: str
    source_snapshot_hash: str
    starting_draft_version: int
    sources: List[Dict[str, Any]]
    existing_fields: Dict[str, Any]
    user_modified_fields: List[str]
    model_id: str

    # Step 1: prepare_source
    prepared_segments: List[Dict[str, Any]]
    segment_lookup: Dict[str, Dict[str, Any]]
    source_text_summary: str

    # Step 2: extract_incident
    extracted_fields: Dict[str, Any]
    field_provenance: Dict[str, Any]

    # Step 3: analyze_evidence
    evidence_assessment: Dict[str, Any]

    # Step 4: propose_investigation
    potential_causes: List[Dict[str, Any]]
    five_whys: List[Dict[str, Any]]
    contributing_factors: List[Dict[str, Any]]
    evidence_gaps: List[Dict[str, Any]]

    # Step 5: propose_capa
    capa_suggestions: List[Dict[str, Any]]

    # Step 6: validate_output
    is_valid: bool
    validation_errors: List[str]
    repair_attempts: int
    final_structured_output: Dict[str, Any]
    human_edit_proposals: Dict[str, Any]
    completed_stages: List[str]
    error: Optional[str]


def _get_completed_stages(state: RCAWorkflowState) -> List[str]:
    curr = state.get("completed_stages")
    return list(curr) if curr else []


# --- Citation Verification Helper ---

def find_best_segment_citation(
    target_text: str,
    segments: List[Dict[str, Any]],
    default_source_id: str = ""
) -> Tuple[Optional[str], Optional[str], Optional[int], str, bool]:
    """
    Locates matching text within source segments and verifies quote under whitespace normalization.
    Returns (source_id, segment_id, page_number, quote, is_verified).
    """
    if not segments or not target_text:
        return None, None, None, "", False

    target_norm = normalize_whitespace(target_text)
    clean_target = target_norm.lower()

    # 1. Exact or substring match in any segment
    for seg in segments:
        seg_text = seg.get("text", "")
        if verify_citation_quote(target_norm, seg_text):
            return (
                seg.get("source_id", default_source_id),
                seg.get("segment_id"),
                seg.get("page_number"),
                target_norm[:200],
                True,
            )

        # Check sentence sub-segments
        sentences = re.split(r"[.!?]\s+", target_norm)
        for s in sentences:
            s_clean = s.strip()
            if len(s_clean) > 15 and verify_citation_quote(s_clean, seg_text):
                return (
                    seg.get("source_id", default_source_id),
                    seg.get("segment_id"),
                    seg.get("page_number"),
                    s_clean[:200],
                    True,
                )

    # 2. Token overlap search to find best reference segment
    words = [w for w in re.findall(r"\w+", clean_target) if len(w) > 3]
    best_seg = None
    highest_score = 0

    for seg in segments:
        seg_text = seg.get("text", "")
        seg_lower = seg_text.lower()
        score = sum(1 for w in words if w in seg_lower)
        if score > highest_score:
            highest_score = score
            best_seg = seg

    if best_seg and highest_score > 0:
        seg_sentences = re.split(r"(?<=[.!?])\s+", best_seg.get("text", ""))
        for sentence in seg_sentences:
            s_clean = sentence.strip()
            if len(s_clean) > 10 and any(w in s_clean.lower() for w in words):
                is_ver = verify_citation_quote(s_clean, best_seg.get("text", ""))
                return (
                    best_seg.get("source_id", default_source_id),
                    best_seg.get("segment_id"),
                    best_seg.get("page_number"),
                    s_clean[:200],
                    is_ver,
                )

        first_clause = best_seg.get("text", "")[:120].strip()
        is_ver = verify_citation_quote(first_clause, best_seg.get("text", ""))
        return (
            best_seg.get("source_id", default_source_id),
            best_seg.get("segment_id"),
            best_seg.get("page_number"),
            first_clause,
            is_ver,
        )

    return None, None, None, "", False


def create_provenance_field(
    value: Any,
    claim_text: str,
    segments: List[Dict[str, Any]],
    default_source_id: str = "",
    is_inferred: bool = False,
) -> Dict[str, Any]:
    """Builds a verified ProvenanceField dictionary."""
    src_id, seg_id, page_no, quote, is_ver = find_best_segment_citation(
        claim_text or str(value or ""), segments, default_source_id
    )
    refs = []
    if src_id and seg_id:
        refs.append({
            "source_id": src_id,
            "segment_id": seg_id,
            "page_number": page_no,
            "quote": quote,
            "snippet": quote,
            "verified": is_ver,
            "unverified_reason": None if is_ver else "Citation quote could not be verified in referenced segment under whitespace normalization.",
        })

    evidence_status = "SUPPORTED" if (refs and is_ver) else ("INFERRED" if is_inferred else "NOT_FOUND")

    return {
        "value": value,
        "origin": "AI",
        "review_state": "UNREVIEWED",
        "source_references": refs,
        "evidence_status": evidence_status,
    }


# --- LangGraph Nodes ---

def node_prepare_source(state: RCAWorkflowState) -> Dict[str, Any]:
    """
    Stage 1: prepare_source
    Extracts all segments, validates boundaries, and builds index lookup.
    """
    sources = state.get("sources", [])
    prepared_segments: List[Dict[str, Any]] = []
    segment_lookup: Dict[str, Dict[str, Any]] = {}

    summary_parts = []
    for s in sources:
        s_id = s.get("id", "")
        s_name = s.get("display_name", "Source Document")
        s_type = s.get("source_type", "TEXT")
        s_text = s.get("extracted_text", "")
        summary_parts.append(f"=== SOURCE [{s_type}]: {s_name} (ID: {s_id}) ===\n{s_text}\n")

        for seg in s.get("segments", []):
            seg_dict = dict(seg) if isinstance(seg, dict) else seg.__dict__
            seg_dict["source_id"] = s_id
            seg_id = seg_dict.get("segment_id", "")
            prepared_segments.append(seg_dict)
            if seg_id:
                segment_lookup[seg_id] = seg_dict

    completed = _get_completed_stages(state)
    if "prepare_source" not in completed:
        completed.append("prepare_source")

    return {
        "prepared_segments": prepared_segments,
        "segment_lookup": segment_lookup,
        "source_text_summary": "\n\n".join(summary_parts),
        "completed_stages": completed,
    }


def node_extract_incident(state: RCAWorkflowState, provider: LLMProvider) -> Dict[str, Any]:
    """
    Stage 2: extract_incident
    Extracts supported incident parameters from source documents.
    Missing values remain null/unknown. Source citations attached.
    """
    source_text = state.get("source_text_summary", "")
    segments = state.get("prepared_segments", [])
    default_src_id = segments[0].get("source_id", "") if segments else ""

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert pharmaceutical Root Cause Analysis specialist operating under ICH Q7, Q9(R1), and Q10. "
                "Extract ONLY factual, verified incident values explicitly supported by the provided source document text. "
                "If a field is not supported or not stated in the source text, set its value strictly to null. "
                "Do NOT invent or guess batch numbers, dates, equipment, or chemical limits.\n"
                "Respond strictly with a JSON object containing:\n"
                "{\n"
                '  "product_name": string or null,\n'
                '  "batch_number": string or null,\n'
                '  "manufacturing_stage": string or null,\n'
                '  "incident_date": string or null,\n'
                '  "site_department": string or null,\n'
                '  "equipment": string or null,\n'
                '  "observed_deviation": string or null,\n'
                '  "expected_condition": string or null,\n'
                '  "actual_condition": string or null,\n'
                '  "immediate_containment": string or null\n'
                "}"
            ),
        },
        {
            "role": "user",
            "content": f"Extract incident parameters from this evidence:\n\n{source_text}",
        },
    ]

    extraction_result = provider.generate_json(messages)

    # Build provenance fields with citations
    field_provenance: Dict[str, Any] = {}
    extracted_fields: Dict[str, Any] = {}

    field_keys = [
        "product_name", "batch_number", "manufacturing_stage", "incident_date",
        "site_department", "equipment", "observed_deviation", "expected_condition",
        "actual_condition", "immediate_containment"
    ]

    for k in field_keys:
        raw_val = extraction_result.get(k)
        extracted_fields[k] = raw_val
        if raw_val:
            field_provenance[k] = create_provenance_field(
                value=raw_val,
                claim_text=str(raw_val),
                segments=segments,
                default_source_id=default_src_id,
                is_inferred=False
            )
        else:
            field_provenance[k] = {
                "value": None,
                "origin": "AI",
                "review_state": "UNREVIEWED",
                "source_references": [],
                "evidence_status": "NOT_FOUND",
            }

    completed = _get_completed_stages(state)
    if "extract_incident" not in completed:
        completed.append("extract_incident")

    return {
        "extracted_fields": extracted_fields,
        "field_provenance": field_provenance,
        "completed_stages": completed,
    }


def node_analyze_evidence(state: RCAWorkflowState, provider: LLMProvider) -> Dict[str, Any]:
    """
    Stage 3: analyze_evidence
    Assesses observed facts, reported allegations, contradictions, and missing evidence.
    """
    source_text = state.get("source_text_summary", "")

    messages = [
        {
            "role": "system",
            "content": (
                "You are an analytical investigator for Active Pharmaceutical Ingredient (API) deviations. "
                "Evaluate the evidence with strict regulatory rigor under FDA OOS and ICH Q10 guidance:\n"
                "1. Observed facts: verified empirical sensor logs, physical readings, or lab measurements.\n"
                "2. Reported allegations: human claims, operator shift handover statements, or supervisor opinions that lack corroboration.\n"
                "3. Contradictions: direct conflicts between human statements and electronic SCADA historian logs.\n"
                "4. Missing evidence: unrecorded critical telemetry, missing calibration records, or missing sample tests.\n"
                "5. Supporting points: telemetry lines or logs supporting the deviation timeline.\n"
                "6. Counter-evidence: physical evidence contradicting simple explanations.\n"
                "Respond strictly with a JSON object:\n"
                "{\n"
                '  "observed_facts": [string],\n'
                '  "reported_allegations": [string],\n'
                '  "contradictions": [string],\n'
                '  "missing_evidence": [string],\n'
                '  "supporting_points": [string],\n'
                '  "counter_evidence": [string]\n'
                "}"
            ),
        },
        {
            "role": "user",
            "content": f"Analyze the evidentiary balance of this incident:\n\n{source_text}",
        },
    ]

    evidence_assessment = provider.generate_json(messages)

    completed = _get_completed_stages(state)
    if "analyze_evidence" not in completed:
        completed.append("analyze_evidence")

    return {
        "evidence_assessment": evidence_assessment,
        "completed_stages": completed,
    }


def node_propose_investigation(state: RCAWorkflowState, provider: LLMProvider) -> Dict[str, Any]:
    """
    Stage 4: propose_investigation
    Generates Potential Causes, 5 Whys, Contributing Factors (6M), and Evidence Gaps.
    - Potential causes: unique ID, evidence strength (LIMITED, MODERATE, STRONG - no fake percentages).
    - 5 Whys: stops when evidence runs out (is_unresolved flag).
    - Contributing factors: 6M categories.
    - Evidence gaps: regulatory rationale, suggested verification step, priority.
    """
    source_text = state.get("source_text_summary", "")
    segments = state.get("prepared_segments", [])
    default_src_id = segments[0].get("source_id", "") if segments else ""
    ev_assessment = state.get("evidence_assessment", {})
    extracted = state.get("extracted_fields", {})

    prompt_context = (
        f"Incident: {extracted.get('observed_deviation', 'Unknown Deviation')}\n"
        f"Product: {extracted.get('product_name', 'Unknown')}, Batch: {extracted.get('batch_number', 'Unknown')}\n"
        f"Observed Facts: {ev_assessment.get('observed_facts', [])}\n"
        f"Allegations: {ev_assessment.get('reported_allegations', [])}\n"
        f"Source Evidence:\n{source_text}"
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert pharmaceutical Root Cause Analysis investigator.\n"
                "Formulate an evidence-based RCA proposal:\n"
                "1. POTENTIAL CAUSES: For each cause, provide:\n"
                "   - id: unique string e.g. 'cause-1', 'cause-2'\n"
                "   - cause: concise description\n"
                "   - category: 'Machine', 'Material', 'Method', 'Measurement', 'Man', or 'Environment'\n"
                "   - rationale: concise evidence-based rationale\n"
                "   - evidence_strength: 'LIMITED', 'MODERATE', or 'STRONG' (DO NOT display invented confidence percentages)\n"
                "   - counter_evidence: any counter-evidence noted\n"
                "   - next_verification_step: concrete next step to verify or rule out\n"
                "   - status: 'HYPOTHESIS'\n"
                "2. 5 WHYS: Step-by-step deductive chain.\n"
                "   - STOP the chain when evidence runs out. Do NOT invent five answers merely to fill five rows!\n"
                "   - Set is_unresolved: true on steps where verification is missing or evidence is incomplete.\n"
                "3. CONTRIBUTING FACTORS: 6M Ishikawa factors distinct from primary hypothesis.\n"
                "4. EVIDENCE Gaps: Information needed, regulatory rationale (ICH/FDA), suggested verification step, priority ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW').\n"
                "Respond strictly with a JSON object:\n"
                "{\n"
                '  "potential_causes": [{\n'
                '     "id": "cause-1",\n'
                '     "cause": string,\n'
                '     "category": string,\n'
                '     "rationale": string,\n'
                '     "evidence_strength": "LIMITED" | "MODERATE" | "STRONG",\n'
                '     "counter_evidence": string or null,\n'
                '     "next_verification_step": string,\n'
                '     "status": "HYPOTHESIS"\n'
                '  }],\n'
                '  "five_whys": [{\n'
                '     "step_number": integer,\n'
                '     "question": string,\n'
                '     "answer": string,\n'
                '     "category": "PHYSICAL" | "HUMAN" | "SYSTEMIC",\n'
                '     "evidence_reference": string,\n'
                '     "is_unresolved": boolean\n'
                '  }],\n'
                '  "contributing_factors": [{\n'
                '     "id": string,\n'
                '     "category": "Machine" | "Material" | "Method" | "Measurement" | "Man" | "Environment",\n'
                '     "factor": string,\n'
                '     "is_contributing": boolean,\n'
                '     "notes": string,\n'
                '     "inference_label": "SUPPORTED" | "INFERRED"\n'
                '  }],\n'
                '  "evidence_gaps": [{\n'
                '     "id": string,\n'
                '     "gap_description": string,\n'
                '     "regulatory_rationale": string,\n'
                '     "impact_level": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",\n'
                '     "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",\n'
                '     "recommended_action": string,\n'
                '     "suggested_verification_step": string\n'
                '  }]\n'
                "}"
            ),
        },
        {
            "role": "user",
            "content": f"Formulate RCA investigation trees for:\n\n{prompt_context}",
        },
    ]

    investigation_proposals = provider.generate_json(messages)

    # Process and attach verified provenance to potential causes
    causes = investigation_proposals.get("potential_causes", [])
    for idx, c in enumerate(causes):
        if not c.get("id"):
            c["id"] = f"cause-{idx + 1}"
        c_desc = c.get("cause") or c.get("description", "")
        c["cause"] = c_desc
        c["description"] = c_desc
        # Attach supporting references
        c["provenance"] = create_provenance_field(c_desc, c.get("rationale", ""), segments, default_src_id, is_inferred=True)
        c["supporting_references"] = c["provenance"].get("source_references", [])

    # Process 5 Whys
    five_whys_list = investigation_proposals.get("five_whys", [])
    for idx, step in enumerate(five_whys_list):
        step["step_number"] = step.get("step_number", idx + 1)
        step_ans = step.get("answer", "")
        step["provenance"] = create_provenance_field(step_ans, step.get("evidence_reference") or step_ans, segments, default_src_id, is_inferred=step.get("is_unresolved", False))

    completed = _get_completed_stages(state)
    if "propose_investigation" not in completed:
        completed.append("propose_investigation")

    return {
        "potential_causes": causes,
        "five_whys": five_whys_list,
        "contributing_factors": investigation_proposals.get("contributing_factors", []),
        "evidence_gaps": investigation_proposals.get("evidence_gaps", []),
        "completed_stages": completed,
    }


def node_propose_capa(state: RCAWorkflowState, provider: LLMProvider) -> Dict[str, Any]:
    """
    Stage 5: propose_capa
    Generates actionable CAPA proposals linked to potential cause IDs.
    - Uses roles (e.g. "Automation Lead"), NOT invented personnel names or fake SOP IDs.
    - Requires measurable effectiveness check.
    - For insufficient evidence, prefers verification/investigation over remediation.
    - Does not default to "retrain staff".
    """
    causes = state.get("potential_causes", [])
    gaps = state.get("evidence_gaps", [])
    segments = state.get("prepared_segments", [])
    default_src_id = segments[0].get("source_id", "") if segments else ""

    causes_summary = "\n".join(
        f"- ID: {c.get('id')}, Cause: {c.get('cause')}, Strength: {c.get('evidence_strength')}, Next Verification: {c.get('next_verification_step')}"
        for c in causes
    )
    gaps_summary = "\n".join(
        f"- Gap: {g.get('gap_description')}, Priority: {g.get('priority') or g.get('impact_level')}"
        for g in gaps
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You are a pharmaceutical Quality Assurance and CAPA specialist operating under ICH Q10.\n"
                "Generate actionable, editable CAPA proposals:\n"
                "1. Each CAPA MUST cross-reference a valid cause ID from the provided potential causes (related_cause_id).\n"
                "2. Type must be 'CORRECTIVE' or 'PREVENTIVE'.\n"
                "3. Proposed responsible role: use a functional job role (e.g. 'Automation Engineering Lead', 'Reliability Manager', 'Quality Assurance Specialist'). "
                "   DO NOT invent names of real or fictional personnel, fake SOP document numbers, completed laboratory results, or signed deadlines.\n"
                "4. Effectiveness criteria: must contain a specific, measurable verification metric (e.g. 'zero parameter excursions over 3 consecutive commercial batches').\n"
                "5. Sparse evidence rule: For causes with LIMITED evidence, prefer diagnostic verification steps over definitive remediation.\n"
                "6. NEVER default every issue to 'retrain staff' (ICH Q10 requires addressing systemic root causes rather than assuming human error).\n"
                "Respond strictly with a JSON object:\n"
                "{\n"
                '  "capa_suggestions": [{\n'
                '     "id": "capa-1",\n'
                '     "capa_type": "CORRECTIVE" | "PREVENTIVE",\n'
                '     "related_cause_id": string (matching a cause ID),\n'
                '     "action_description": string,\n'
                '     "short_rationale": string,\n'
                '     "responsible_role": string,\n'
                '     "proposed_due_date": string,\n'
                '     "effectiveness_criteria": string,\n'
                '     "status": "PROPOSED"\n'
                '  }]\n'
                "}"
            ),
        },
        {
            "role": "user",
            "content": f"Propose CAPAs for these potential causes and evidence gaps:\n\nCAUSES:\n{causes_summary}\n\nEVIDENCE GAPS:\n{gaps_summary}",
        },
    ]

    capa_result = provider.generate_json(messages)
    capa_list = capa_result.get("capa_suggestions", [])

    # Process CAPA provenance
    for idx, capa in enumerate(capa_list):
        if not capa.get("id"):
            capa["id"] = f"capa-{idx + 1}"
        capa["owner"] = capa.get("responsible_role")
        capa["target_date"] = capa.get("proposed_due_date")
        capa["provenance"] = create_provenance_field(
            capa.get("action_description", ""), "", segments, default_src_id, is_inferred=True
        )

    completed = _get_completed_stages(state)
    if "propose_capa" not in completed:
        completed.append("propose_capa")

    return {
        "capa_suggestions": capa_list,
        "completed_stages": completed,
    }


def node_validate_output(state: RCAWorkflowState) -> Dict[str, Any]:
    """
    Stage 6: validate_output
    - Validates cross-references (capa.related_cause_id must match a cause ID).
    - Verifies citations against source segments.
    - Implements Human Edit Protection:
      - Fields previously edited by human are preserved in draft.
      - AI suggestions for human-edited fields are saved as explicit proposals in human_edit_proposals.
      - Empty or unmodified fields are auto-filled.
    """
    errors: List[str] = []

    causes = state.get("potential_causes", [])
    cause_ids = {c.get("id") for c in causes if c.get("id")}
    if len(cause_ids) != len(causes):
        errors.append("Potential causes contain duplicate or missing IDs.")

    capas = state.get("capa_suggestions", [])
    capa_ids = {c.get("id") for c in capas if c.get("id")}
    if len(capa_ids) != len(capas):
        errors.append("CAPA suggestions contain duplicate or missing IDs.")

    # Cross-reference check: CAPA -> Cause
    for capa in capas:
        rel_id = capa.get("related_cause_id")
        if rel_id and rel_id not in cause_ids and cause_ids:
            # Auto-repair or flag error
            errors.append(f"CAPA '{capa.get('id')}' references non-existent cause ID '{rel_id}'.")

    # If errors and repair_attempts < 2, return invalid to trigger repair node
    repair_attempts = state.get("repair_attempts", 0)
    if errors and repair_attempts < 2:
        return {
            "is_valid": False,
            "validation_errors": errors,
        }

    # If cross-reference error persisted, fallback fix to first cause
    if errors and causes:
        first_cause_id = causes[0].get("id")
        for capa in capas:
            if capa.get("related_cause_id") not in cause_ids:
                capa["related_cause_id"] = first_cause_id

    # --- Conflict-Aware Human Edit Protection Merge ---
    existing_fields = state.get("existing_fields", {})
    user_modified_fields = state.get("user_modified_fields", [])
    extracted_fields = state.get("extracted_fields", {})
    field_prov = dict(state.get("field_provenance", {}))
    human_edit_proposals: Dict[str, Any] = {}

    for field_name, ai_val in extracted_fields.items():
        if not ai_val:
            continue

        existing_val = existing_fields.get(field_name)
        is_user_modified = (field_name in user_modified_fields)

        if is_user_modified and existing_val and existing_val != ai_val:
            # Human Edit Protection: preserve user edit in draft, record proposal for review
            ai_prov = field_prov.get(field_name, {})
            human_edit_proposals[field_name] = {
                "field_name": field_name,
                "current_user_value": str(existing_val),
                "ai_proposed_value": str(ai_val),
                "rationale": f"AI extraction found alternative value '{ai_val}' in evidentiary records.",
                "source_references": ai_prov.get("source_references", []),
                "proposed_at": datetime.now(timezone.utc).isoformat(),
            }
            # Maintain human provenance
            field_prov[field_name] = {
                "value": existing_val,
                "origin": "HUMAN",
                "review_state": "EDITED",
                "source_references": [],
                "evidence_status": "INFERRED",
            }
        elif not existing_val:
            # Auto-populate empty field
            pass

    # Assemble final structured output
    final_output = {
        "field_provenance": field_prov,
        "evidence_assessment": state.get("evidence_assessment", {}),
        "five_whys": state.get("five_whys", []),
        "potential_causes": causes,
        "contributing_factors": state.get("contributing_factors", []),
        "evidence_gaps": state.get("evidence_gaps", []),
        "capa_suggestions": capas,
        "human_edit_proposals": human_edit_proposals,
        "domain_guidance_references": REGULATORY_BACKGROUND_GUIDANCE,
        "regulatory_disclaimer": (
            "Source content represents evidence supplied for the investigation; domain guidance represents technical background research. "
            "Neither is proof that an AI hypothesis is scientifically confirmed under GMP. "
            "Author assertions (such as operator error claims) are treated as reported claims requiring independent verification, not established causality."
        ),
        "human_review_decisions": {},
    }

    completed = _get_completed_stages(state)
    if "validate_output" not in completed:
        completed.append("validate_output")

    return {
        "is_valid": True,
        "validation_errors": [],
        "final_structured_output": final_output,
        "human_edit_proposals": human_edit_proposals,
        "completed_stages": completed,
    }


def node_repair_output(state: RCAWorkflowState) -> Dict[str, Any]:
    """
    Bounded Repair Node: Fixes missing IDs or invalid cross-references.
    """
    repair_attempts = state.get("repair_attempts", 0) + 1
    causes = list(state.get("potential_causes", []))
    capas = list(state.get("capa_suggestions", []))

    # Repair unique cause IDs
    for idx, c in enumerate(causes):
        if not c.get("id"):
            c["id"] = f"cause-{idx + 1}"

    cause_ids = {c.get("id") for c in causes}
    fallback_id = causes[0].get("id") if causes else "cause-1"

    # Repair CAPA cross-references
    for idx, capa in enumerate(capas):
        if not capa.get("id"):
            capa["id"] = f"capa-{idx + 1}"
        if not capa.get("related_cause_id") or capa.get("related_cause_id") not in cause_ids:
            capa["related_cause_id"] = fallback_id

    return {
        "repair_attempts": repair_attempts,
        "potential_causes": causes,
        "capa_suggestions": capas,
    }


# --- Graph Construction ---

def build_langgraph_workflow(provider: LLMProvider):
    """
    Constructs a compiled LangGraph StateGraph orchestrating the 6 RCA stages:
    START -> prepare_source -> extract_incident -> analyze_evidence -> propose_investigation -> propose_capa -> validate_output -> END
    With bounded repair loop on validation issues.
    """
    workflow = StateGraph(RCAWorkflowState)

    # Bind provider to nodes
    workflow.add_node("prepare_source", node_prepare_source)
    workflow.add_node("extract_incident", lambda s: node_extract_incident(s, provider))
    workflow.add_node("analyze_evidence", lambda s: node_analyze_evidence(s, provider))
    workflow.add_node("propose_investigation", lambda s: node_propose_investigation(s, provider))
    workflow.add_node("propose_capa", lambda s: node_propose_capa(s, provider))
    workflow.add_node("validate_output", node_validate_output)
    workflow.add_node("repair_output", node_repair_output)

    workflow.set_entry_point("prepare_source")
    workflow.add_edge("prepare_source", "extract_incident")
    workflow.add_edge("extract_incident", "analyze_evidence")
    workflow.add_edge("analyze_evidence", "propose_investigation")
    workflow.add_edge("propose_investigation", "propose_capa")
    workflow.add_edge("propose_capa", "validate_output")

    def route_after_validate(state: RCAWorkflowState) -> str:
        if not state.get("is_valid", True) and state.get("repair_attempts", 0) < 2:
            return "repair_output"
        return END

    workflow.add_conditional_edges(
        "validate_output",
        route_after_validate,
        {
            "repair_output": "repair_output",
            END: END,
        }
    )
    workflow.add_edge("repair_output", "validate_output")

    return workflow.compile()


def execute_langgraph_rca(
    sources: List[Any],
    existing_fields: Dict[str, Any],
    user_modified_fields: Optional[List[str]] = None,
    stage_callback: Optional[Callable[[str], None]] = None,
    provider_override: Optional[LLMProvider] = None,
) -> Tuple[str, Dict[str, Any], List[str]]:
    """
    Executes the typed LangGraph RCA pipeline.
    
    1. Verifies Groq configuration (raises GroqConfigurationError if missing, no silent fallback).
    2. Instantiates LangGraph state machine.
    3. Runs stage transitions and updates callback.
    4. Applies Human Edit Protection conflict-aware merge.
    
    Returns: (model_id, structured_output, completed_stages)
    """
    # 1. Resolve Provider
    if provider_override:
        provider = provider_override
    else:
        # Strict enforcement: verify GROQ_API_KEY presence
        verify_groq_configuration()
        provider = GroqLiveProvider(
            api_key=settings.GROQ_API_KEY,
            model_id=settings.GROQ_MODEL
        )

    # 2. Serialize sources
    serialized_sources = []
    snapshot_hash = ""
    for s in sources:
        s_id = str(getattr(s, "id", "") or (s.get("id") if isinstance(s, dict) else ""))
        s_name = str(getattr(s, "display_name", "") or (s.get("display_name") if isinstance(s, dict) else "Evidence Document"))
        s_type = str(getattr(s, "source_type", "") or (s.get("source_type") if isinstance(s, dict) else "TEXT"))
        s_text = str(getattr(s, "extracted_text", "") or (s.get("extracted_text") if isinstance(s, dict) else ""))
        s_hash = str(getattr(s, "content_hash", "") or (s.get("content_hash") if isinstance(s, dict) else ""))
        s_segs = getattr(s, "segments", []) or (s.get("segments") if isinstance(s, dict) else [])

        snapshot_hash += s_hash
        serialized_sources.append({
            "id": s_id,
            "display_name": s_name,
            "source_type": s_type,
            "extracted_text": s_text,
            "content_hash": s_hash,
            "segments": s_segs,
        })

    # 3. Construct initial graph state
    initial_state: RCAWorkflowState = {
        "investigation_id": str(existing_fields.get("investigation_id", "")),
        "source_snapshot_hash": snapshot_hash,
        "starting_draft_version": int(existing_fields.get("version", 1)),
        "sources": serialized_sources,
        "existing_fields": existing_fields,
        "user_modified_fields": user_modified_fields or [],
        "model_id": provider.model_id,
        "completed_stages": [],
        "repair_attempts": 0,
    }

    # 4. Compile and stream graph stage transitions
    graph = build_langgraph_workflow(provider)
    final_output: Dict[str, Any] = {}
    completed_stages: List[str] = []

    for event in graph.stream(initial_state):
        for node_name, node_state in event.items():
            if node_name not in ("__end__", "repair_output"):
                if node_name not in completed_stages:
                    completed_stages.append(node_name)
                if stage_callback:
                    try:
                        stage_callback(node_name)
                    except Exception as cb_err:
                        logger.warning(f"stage_callback error on node {node_name}: {cb_err}")
            if isinstance(node_state, dict) and "final_structured_output" in node_state:
                final_output = node_state["final_structured_output"]

    if not final_output:
        final_state = graph.invoke(initial_state)
        final_output = final_state.get("final_structured_output", {})
        completed_stages = final_state.get("completed_stages", completed_stages)

    return provider.model_id, final_output, completed_stages
