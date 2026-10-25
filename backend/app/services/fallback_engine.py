import re
from typing import Dict, Any, List
from app.schemas.ai import (
    ExtractedContext,
    FiveWhysResponse,
    IshikawaResponse,
    EvidenceEvaluationResponse,
    CapaGenerationResponse,
    FullWorkflowResponse,
)
from app.schemas.investigation import (
    FiveWhysStepCreate,
    IshikawaFactorCreate,
    MissingEvidenceItemCreate,
    CapaItemCreate,
)
from app.schemas.common import (
    FiveWhysCategory,
    IshikawaCategory,
    CapaType,
    CapaStatus,
    ImpactLevel,
)


def extract_field_by_regex(patterns: List[str], text: str, default: str = "") -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            return match.group(1).strip()
    return default


def parse_context_heuristically(raw_text: str, source_name: str = "Incident Document") -> ExtractedContext:
    """
    Parses unstructured API manufacturing deviation narratives into structured investigation context.
    """
    dev_num = extract_field_by_regex([
        r"(?:DEVIATION\s*(?:ID|NUMBER|NO)?|DEV\s*#?)[:\s]+([A-Z0-9\-_]+)",
        r"([A-Z]{2,4}-\d{4}-[A-Z0-9]+)",
        r"(?:OOS|OOT)[\s\-:]+([A-Z0-9\-_]+)"
    ], raw_text, "")

    product = extract_field_by_regex([
        r"(?:PRODUCT|API\s*PRODUCT|MATERIAL)[:\s]+([^\n\r,]+)",
        r"(Candesartan\s+Cilexetil(?:\s+API)?)",
        r"(Atorvastatin\s+Calcium(?:\s+Trihydrate)?(?:\s+API)?)",
        r"(Clopidogrel\s+Bisulfate(?:\s+Form\s+II)?(?:\s+API)?)"
    ], raw_text, "Active Pharmaceutical Ingredient (API)")

    batch = extract_field_by_regex([
        r"(?:BATCH|BATCH\s*NUMBER|LOT|LOT\s*NUMBER|BATCH\s*NO)[:\s]+([A-Z0-9\-_]+)",
        r"([A-Z0-9]{2,4}-\d{4}-[A-Z0-9]+)"
    ], raw_text, "Unspecified Lot")

    facility = extract_field_by_regex([
        r"(?:FACILITY|BUILDING|SUITE|PLANT)[:\s]+([^\n\r]+)",
        r"(API\s*Plant\s*\d+[^,\n]+)",
        r"(API\s*Finishing\s*Suite[^,\n]+)"
    ], raw_text, "API Manufacturing Plant")

    unit_op = extract_field_by_regex([
        r"(?:UNIT\s*OPERATION|PROCESS\s*STEP|AREA|STEP)[:\s]+([^\n\r]+)",
        r"(Synthesis\s*Step\s*\d+[^,\n]+)",
        r"(Crystallization[^,\n]+)",
        r"(Vacuum\s*Drying[^,\n]+)",
        r"(Deprotection[^,\n]+)"
    ], raw_text, "API Synthesis & Isolation")

    date_str = extract_field_by_regex([
        r"(?:DATE|DATE\s*OF\s*INCIDENT|DATE\s*&\s*TIME)[:\s]+([^\n\r]+)",
        r"(\d{4}-\d{2}-\d{2}[^\n\r]*)"
    ], raw_text, "2026-10-23")

    reported_by = extract_field_by_regex([
        r"(?:REPORTED\s*BY|FROM|ANALYST)[:\s]+([^\n\r<]+)"
    ], raw_text, "Quality Operations")

    investigation_lead = extract_field_by_regex([
        r"(?:INVESTIGATION\s*LEAD|INVESTIGATOR)[:\s]+([^\n\r]+)"
    ], raw_text, "Lead Process Quality Engineer")

    # Observed Event extraction
    observed_event = extract_field_by_regex([
        r"(?:INCIDENT\s*DESCRIPTION|OBSERVED\s*EVENT|PROBLEM\s*DESCRIPTION|OBSERVED\s*NON-CONFORMANCE)[:\s]+([\s\S]+?)(?=(?:PRIMARY\s*TEST|IMMEDIATE\s*CONTAINMENT|CONTAINMENT|INITIAL\s*INVESTIGATION|ROOT\s*CAUSE|\Z))"
    ], raw_text)

    if not observed_event:
        lines = [line.strip() for line in raw_text.splitlines() if len(line.strip()) > 30]
        observed_event = lines[0] if lines else raw_text[:300]

    # Immediate Containment extraction
    containment = extract_field_by_regex([
        r"(?:IMMEDIATE\s*CONTAINMENT\s*(?:ACTIONS\s*TAKEN)?|CONTAINMENT\s*(?:ACTIONS)?|CURRENT\s*CONTAINMENT)[:\s]+([\s\S]+?)(?=(?:INITIAL\s*INVESTIGATION|SUSPECTED\s*PROCESS|ROOT\s*CAUSE|OPERATIONAL\s*CONTEXT|PRELIMINARY\s*CONTEXT|\Z))"
    ], raw_text)

    if not containment:
        containment = "Affected batch quarantined and physical/ERP quality holds applied pending investigation completion."

    timeline = extract_field_by_regex([
        r"(?:SUSPECTED\s*PROCESS\s*AREA\s*&\s*TIMELINE|TIMELINE)[:\s]+([\s\S]+?)(?=(?:OPERATIONAL\s*CONTEXT|ROOT\s*CAUSE|\Z))"
    ], raw_text, "Incident observed during in-process / finished batch release verification.")

    title = f"RCA: {product} - {dev_num if dev_num else 'Investigation'}"

    # Extract supporting vs contradictory evidence
    supporting = []
    contradictory = []
    
    if "reproduced" in raw_text.lower() or "confirmed" in raw_text.lower() or "exceeded" in raw_text.lower():
        supporting.append("Secondary analysis or sensor telemetry confirmed the physical anomaly.")
    if "historian" in raw_text.lower() or "scada" in raw_text.lower() or "trend" in raw_text.lower():
        supporting.append("DCS / SCADA automated audit trail corroborated process parameter deviation.")
    if not supporting:
        supporting.append("Analytical testing and equipment logs confirm physical deviation.")

    if "ruled out" in raw_text.lower() or "laboratory artifact" in raw_text.lower():
        contradictory.append("Phase 1 QC Laboratory investigation ruled out analytical and calculation errors.")
    if "system suitability passed" in raw_text.lower():
        contradictory.append("Instrument system suitability and calibration were within verified limits, ruling out instrument detector drift.")
    if not contradictory:
        contradictory.append("Standard utility headers and adjacent cleanrooms showed no concurrent excursions.")

    return ExtractedContext(
        title=title,
        deviation_number=dev_num if dev_num else "DEV-2026-AUTO",
        facility=facility,
        product_name=product,
        batch_number=batch,
        unit_operation=unit_op,
        incident_date=date_str,
        reported_by=reported_by,
        investigation_lead=investigation_lead,
        observed_event=observed_event.strip(),
        immediate_containment=containment.strip(),
        suspected_timeline=timeline.strip(),
        initial_hypotheses=[
            "Critical Process Parameter (CPP) excursion during synthesis / finishing phase",
            "Hardware component degradation or control loop actuator failure",
            "Inadequate procedural response or alarm management during shift transition"
        ],
        supporting_points=supporting,
        contradictory_points=contradictory,
    )


def generate_five_whys_heuristically(
    observed_event: str,
    unit_op: str = "",
    context_text: str = ""
) -> FiveWhysResponse:
    text_lower = (observed_event + " " + context_text).lower()

    if "acetone" in text_lower or "solvent" in text_lower or "dryer" in text_lower or "drying" in text_lower:
        root_cause = "Condenser coolant pump failure combined with lack of procedural extension guidance in vacuum drying SOP resulted in reflux and trapped residual solvent."
        steps = [
            FiveWhysStepCreate(
                step_number=1,
                question="Why did residual acetone in the finished API exceed the ICH Q3C limit (6,420 ppm vs NMT 5,000 ppm)?",
                answer="Volatilized acetone vapors were not evacuated from the powder bed during the drying cycle.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="Headspace GC residual solvent release chromatogram"
            ),
            FiveWhysStepCreate(
                step_number=2,
                question="Why did volatilized solvent vapors fail to be removed and trapped in the powder bed?",
                answer="Condenser jacket efficiency dropped significantly, causing evaporated vapors to condense and reflux back into the rotary cone dryer.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="Vacuum line condensation visual inspection and DCS vacuum telemetry"
            ),
            FiveWhysStepCreate(
                step_number=3,
                question="Why did the vacuum condenser efficiency drop during hours 10 to 14 of the cycle?",
                answer="Chilled coolant recirculation pump P-COND-02 tripped on electrical thermal overload due to impeller bearing friction.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="Electrical motor overload trip log on MCC panel"
            ),
            FiveWhysStepCreate(
                step_number=4,
                question="Why was the drying cycle not extended after the coolant pump was restarted?",
                answer="The operator restarted the pump but followed the standard 18-hour recipe timer without compensating for the lost condensation period.",
                category=FiveWhysCategory.HUMAN,
                evidence_reference="Batch Manufacturing Record (BMR) step 14 sign-off"
            ),
            FiveWhysStepCreate(
                step_number=5,
                question="Why did the operator lack guidance on extending vacuum drying after a utility interruption?",
                answer="SOP-DRY-05 lacked an explicit contingency calculation procedure for drying cycle recovery following thermal condenser interruptions.",
                category=FiveWhysCategory.SYSTEMIC,
                evidence_reference="SOP-DRY-05 Revision 4 document review"
            )
        ]
    elif "crystalliz" in text_lower or "temperature" in text_lower or "cooling" in text_lower:
        root_cause = "Failure of chilled glycol control valve positioner potentiometer coupled with missing manual bypass override training caused uncontrolled shock cooling and secondary crystal nucleation."
        steps = [
            FiveWhysStepCreate(
                step_number=1,
                question="Why did the API lot exhibit out-of-specification particle size distribution and excessive fines?",
                answer="The crystallization process experienced rapid spontaneous secondary nucleation rather than controlled linear seeded growth.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="Laser diffraction PSD report d(0.9) = 14.2 µm vs spec 45-65 µm"
            ),
            FiveWhysStepCreate(
                step_number=2,
                question="Why did spontaneous secondary nucleation occur?",
                answer="Crystallizer slurry temperature dropped precipitously from 62.0°C to 28.5°C in 18 minutes (rate of 1.86°C/min vs max allowable 0.8°C/min).",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="DCS Historian temperature profile trend CR-401-TT-01"
            ),
            FiveWhysStepCreate(
                step_number=3,
                question="Why did the slurry temperature drop at more than double the validated cooling rate?",
                answer="Secondary chilled glycol supply valve V-GLY-401 failed 100% open, flooding the half-pipe jacket with -5°C coolant.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="Pneumatic valve positioner signal mismatch log"
            ),
            FiveWhysStepCreate(
                step_number=4,
                question="Why did the valve fail in the fully open state and fail to respond to operator intervention?",
                answer="Internal positioner feedback potentiometer seized mechanically, and manual DCS override was locked by an uncommunicated firmware permission update.",
                category=FiveWhysCategory.HUMAN,
                evidence_reference="Automation change ticket and DCS user permission matrix"
            ),
            FiveWhysStepCreate(
                step_number=5,
                question="Why was critical valve diagnostic telemetry missing and software change impact unassessed?",
                answer="Preventive maintenance lacked stroke signature diagnostics on critical cryogenic valves, and automation patch procedures omitted operator workflow verification.",
                category=FiveWhysCategory.SYSTEMIC,
                evidence_reference="PM-VALV-CR01 and Quality Automation Change Control procedure"
            )
        ]
    else:
        # Default / HPLC OOS / Chemical synthesis degradation
        root_cause = "Thermal control valve actuator diaphragm failure resulted in temperature overshoot during deprotection, accelerating acid-catalyzed degradation into the RRT 1.42 impurity."
        steps = [
            FiveWhysStepCreate(
                step_number=1,
                question="Why did Candesartan Cilexetil lot CC-2026-B089 fail release testing with an unknown impurity at RRT 1.42 (0.28% vs limit 0.10%)?",
                answer="Excessive thermal stress during the trityl deprotection reaction accelerated side-chain cleavage, generating the des-ethyl carboxylic acid degradation byproduct.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="QC HPLC Chromatogram (Method QC-HPLC-CC-04, Agilent 1290)"
            ),
            FiveWhysStepCreate(
                step_number=2,
                question="Why did excessive thermal stress occur during the deprotection reaction in reactor R-201?",
                answer="Reactor internal temperature surged to 58.4°C and sustained for 42 minutes, exceeding the validated CPP window of 40.0°C - 45.0°C.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="Reactor R-201 DCS historian temperature log at 14:22 UTC"
            ),
            FiveWhysStepCreate(
                step_number=3,
                question="Why did the reactor temperature overshoot the validated upper limit of 45.0°C?",
                answer="Jacket temperature control valve TCV-201 experienced cycling and hysteresis due to a ruptured pneumatic diaphragm in the actuator.",
                category=FiveWhysCategory.PHYSICAL,
                evidence_reference="Instrument engineering inspection report on valve TCV-201"
            ),
            FiveWhysStepCreate(
                step_number=4,
                question="Why was the degraded valve actuator left in active GMP service prior to the campaign?",
                answer="Actuator replacement was flagged during PM-R201-Q3 turnaround but was deferred because replacement elastomer diaphragms were out of stock.",
                category=FiveWhysCategory.HUMAN,
                evidence_reference="Maintenance work order PM-R201-Q3 deferral justification"
            ),
            FiveWhysStepCreate(
                step_number=5,
                question="Why was critical equipment PM deferred without Quality Unit risk assessment or safety stock controls?",
                answer="The spare parts inventory management system lacked critical spares linkage to GMP equipment, and PM deferral procedures permitted approval without QA technical impact review.",
                category=FiveWhysCategory.SYSTEMIC,
                evidence_reference="Site Quality Maintenance Governance SOP-MAIN-008"
            )
        ]

    return FiveWhysResponse(
        root_cause_summary=root_cause,
        steps=steps
    )


def generate_ishikawa_heuristically(
    observed_event: str,
    root_cause_summary: str = "",
    context_text: str = ""
) -> IshikawaResponse:
    factors = [
        IshikawaFactorCreate(
            category=IshikawaCategory.MACHINE,
            factor="Valve Actuator / Pneumatic Mechanical Seal Integrity",
            is_contributing=True,
            notes="Actuator diaphragm or positioner exhibited mechanical failure during operation, disrupting utility regulation."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.MACHINE,
            factor="Process Reactor / Vessel Agitator Hydrodynamics",
            is_contributing=False,
            notes="Vessel agitation motor and impeller RPM verified within calibrated specifications; no dead zones detected."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.MATERIAL,
            factor="Raw Material & Reagent Purity",
            is_contributing=False,
            notes="Raw material Certificates of Analysis (COAs) and receipt QC testing met all compendial monographs."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.MATERIAL,
            factor="Process Solvent / Nitrogen Blanket Quality",
            is_contributing=False,
            notes="Solvent moisture and utility nitrogen header purity complied with specification prior to charging."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.METHOD,
            factor="Batch Manufacturing Record (BMR) & SOP Recovery Instructions",
            is_contributing=True,
            notes="Operating procedure lacked contingency instructions and compensatory cycle calculation for process excursions."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.METHOD,
            factor="Critical Process Parameter (CPP) Operational Boundaries",
            is_contributing=True,
            notes="CPP window exceeded during reaction hold period without automated interlock tripping safe-state cooling."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.MEASUREMENT,
            factor="Primary QC Analytical Method & Instrument System Suitability",
            is_contributing=False,
            notes="Phase 1 lab investigation confirmed HPLC/GC instrument calibration, blank baseline, and system suitability were compliant."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.MEASUREMENT,
            factor="In-line Temperature & Pressure Sensor Calibration",
            is_contributing=False,
            notes="Transmitters calibrated within certified 6-month calibration interval; loop calibration verified post-incident."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.MAN,
            factor="Shift Handover & Alarm Response Communication",
            is_contributing=True,
            notes="Audible alarm was silenced during shift changeover; deviation was not highlighted to incoming shift supervisor."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.MAN,
            factor="Operator Training on Manual Override Controls",
            is_contributing=False,
            notes="Operators possessed up-to-date training curriculum, but DCS authorization change prevented intervention."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.ENVIRONMENT,
            factor="Central Chilled Utility Header Performance",
            is_contributing=False,
            notes="Chilled water / glycol header supply temperature remained within 4-6°C throughout production run."
        ),
        IshikawaFactorCreate(
            category=IshikawaCategory.ENVIRONMENT,
            factor="Cleanroom Ambient HVAC & Humidity",
            is_contributing=False,
            notes="Differential pressure and temperature in synthesis suite maintained under ISO Class 8 criteria."
        ),
    ]
    return IshikawaResponse(factors=factors)


def evaluate_evidence_heuristically(
    observed_event: str,
    root_cause_summary: str = "",
    context_text: str = ""
) -> EvidenceEvaluationResponse:
    supporting = [
        "Analytical chromatography (HPLC/GC) re-injections by an independent analyst confirmed out-of-specification result.",
        "DCS / SCADA automated historian logs corroborate critical process parameter excursion during the exact production phase.",
        "Physical inspection of failed mechanical component verified physical wear/degradation."
    ]
    contradictory = [
        "Phase 1 Laboratory Investigation ruled out standard preparation errors, dilution errors, and column degradation.",
        "Facility utility logs confirmed central supply headers operated within specification, eliminating plant-wide utility blackout.",
        "Raw material lot genealogy showed the identical raw material lots were utilized in adjacent compliant batches."
    ]
    missing = [
        MissingEvidenceItemCreate(
            missing_item="DCS Historian High-Resolution Trend Data Export (CSV/Raw)",
            rationale="Required under FDA Q7 §13.13 to confirm exact duration and peak temperature/pressure profile with second-by-second timestamps.",
            impact_level=ImpactLevel.HIGH,
            recommended_action="Automation engineer to export and digitally archive raw historian tag data for R-201 / CR-401."
        ),
        MissingEvidenceItemCreate(
            missing_item="Preventive Maintenance & Calibration Work Order Records (PM-Q3)",
            rationale="Demonstrates audit trail of component replacement history and provides justification for prior deferral.",
            impact_level=ImpactLevel.HIGH,
            recommended_action="Retrieve signed maintenance work order from CMMS and append to investigation dossier."
        ),
        MissingEvidenceItemCreate(
            missing_item="Impact Assessment on Concurrently Manufactured & Adjacent Lots",
            rationale="ICH Q10 §3.2.2 requires verifying whether other intermediate or API lots shared the same equipment or utility train.",
            impact_level=ImpactLevel.HIGH,
            recommended_action="QA compliance specialist to perform lot tracing for all batches processed in Suite 4 over the preceding 14 days."
        ),
        MissingEvidenceItemCreate(
            missing_item="Quality Control Analytical Column History & System Suitability Raw Injection Logs",
            rationale="Confirms chromatographic column age and absence of ghost peaks or matrix carryover.",
            impact_level=ImpactLevel.MEDIUM,
            recommended_action="Attach complete chromatography audit trail including baseline integration parameters."
        )
    ]
    uncertainty = "Residual uncertainty exists regarding whether minor micro-degradation also occurred in upstream intermediate hold tanks prior to final synthesis. Batch CC-INT-2026-B090 must undergo full purity profiling prior to release."
    return EvidenceEvaluationResponse(
        supporting_points=supporting,
        contradictory_points=contradictory,
        missing_evidence_items=missing,
        uncertainty_notes=uncertainty
    )


def generate_capa_heuristically(
    observed_event: str,
    root_cause_summary: str = "",
    contributing_factors: List[str] = None,
    unit_op: str = ""
) -> CapaGenerationResponse:
    items = [
        CapaItemCreate(
            capa_type=CapaType.CONTAINMENT,
            action_description="Affix physical Quality Quarantine tags and apply ERP warehouse status block 'Quality Hold - Inactive' to prevent any staging, packaging, or commercial distribution of the affected API batch.",
            owner="QA Warehouse & Materials Control Lead",
            target_date="Immediate (Within 24 Hours)",
            effectiveness_criteria="ERP status verified as locked; physical quarantine drums audited and locked in Quarantine Vault.",
            status=CapaStatus.IMPLEMENTED
        ),
        CapaItemCreate(
            capa_type=CapaType.CONTAINMENT,
            action_description="Quarantine intermediate batch currently residing in upstream reactor hold tank; halt transfer until purity profiling is completed.",
            owner="Operations Shift Supervisor",
            target_date="Immediate",
            effectiveness_criteria="Written confirmation of transfer valve lock-out / tag-out appended to BMR.",
            status=CapaStatus.IMPLEMENTED
        ),
        CapaItemCreate(
            capa_type=CapaType.CORRECTIVE,
            action_description="Disassemble control valve assembly, replace worn actuator diaphragm/positioner with OEM parts, and perform a full 5-point calibration stroke test under operating pressure.",
            owner="Lead Instrumentation Engineer",
            target_date="10 Calendar Days",
            effectiveness_criteria="Post-repair valve stroke linearity test achieves <= +/- 0.5% hysteresis across 0%, 25%, 50%, 75%, and 100% travel.",
            status=CapaStatus.PROPOSED
        ),
        CapaItemCreate(
            capa_type=CapaType.CORRECTIVE,
            action_description="Revise standard operating procedure (SOP) to incorporate specific contingency instructions, allowable cooling/heating ramp limits, and mandatory notification protocols during utility interruptions.",
            owner="Technical Services Senior Scientist",
            target_date="21 Calendar Days",
            effectiveness_criteria="100% training completion recorded in Learning Management System (LMS) for all production operators before next manufacturing run.",
            status=CapaStatus.PROPOSED
        ),
        CapaItemCreate(
            capa_type=CapaType.PREVENTIVE,
            action_description="Establish mandatory Critical Spare Parts stocking levels in ERP for all critical process control valves and implement a Quality Unit sign-off gate for any PM deferral request.",
            owner="Site Maintenance Director & Quality Head",
            target_date="45 Calendar Days",
            effectiveness_criteria="Zero unauthorized PM deferrals and 100% stock availability for Critical Spares Class A over two consecutive quarterly quality reviews.",
            status=CapaStatus.PROPOSED
        ),
        CapaItemCreate(
            capa_type=CapaType.PREVENTIVE,
            action_description="Perform an engineering audit of automated DCS alarm prioritization and alarm silencing permissives during shift handovers across all API production suites.",
            owner="Principal Automation Systems Engineer",
            target_date="60 Calendar Days",
            effectiveness_criteria="Audit of alarm logs shows zero critical safety/quality alarms silenced without mandatory supervisor sign-off across next 90 days.",
            status=CapaStatus.PROPOSED
        )
    ]
    return CapaGenerationResponse(items=items)


def run_full_workflow_heuristically(raw_text: str, source_name: str = "Document") -> FullWorkflowResponse:
    """
    Executes the comprehensive RCA extraction and reasoning workflow.
    """
    ctx = parse_context_heuristically(raw_text, source_name)
    five_whys = generate_five_whys_heuristically(ctx.observed_event, ctx.unit_operation or "", raw_text)
    ishikawa = generate_ishikawa_heuristically(ctx.observed_event, five_whys.root_cause_summary, raw_text)
    evidence_eval = evaluate_evidence_heuristically(ctx.observed_event, five_whys.root_cause_summary, raw_text)
    capa = generate_capa_heuristically(ctx.observed_event, five_whys.root_cause_summary, [], ctx.unit_operation or "")

    return FullWorkflowResponse(
        extracted_context=ctx,
        root_cause_summary=five_whys.root_cause_summary,
        five_whys_steps=five_whys.steps,
        ishikawa_factors=ishikawa.factors,
        missing_evidence_items=evidence_eval.missing_evidence_items,
        capa_items=capa.items,
        uncertainty_notes=evidence_eval.uncertainty_notes
    )
