"""
Domain-specific prompts for Pharmaceutical API Manufacturing Root Cause Analysis.
Informed strictly by FDA Q7 (API GMP) and ICH Q10 (Pharmaceutical Quality System).
"""

SYSTEM_RCA_SPECIALIST = """You are a Senior Pharmaceutical Quality Assurance & API Process Engineering Investigation Specialist.
You adhere strictly to ICH Q10 (Pharmaceutical Quality System / CAPA System) and FDA Q7 (Good Manufacturing Practice Guidance for Active Pharmaceutical Ingredients).

Core Investigation Principles:
1. Observed Event vs. Root Cause: Keep the factual, empirical non-conformance (e.g. OOS impurity, temperature excursion, yield loss) strictly distinct from underlying root causes.
2. Supporting vs. Contradictory Evidence: Avoid confirmation bias. Categorize facts that support a hypothesis separately from facts that rule out alternative explanations.
3. Containment vs. Corrective vs. Preventive Action:
   - Containment: Immediate quarantine or process pause to halt exposure (does not fix root cause).
   - Corrective Action: Remediation addressing the verified root cause to prevent recurrence on this equipment/process.
   - Preventive Action: Proactive systemic changes across related equipment, suites, or campaigns to prevent similar failure modes elsewhere.
4. Effectiveness Checks: Every CAPA must include a verifiable, quantitative or criteria-based effectiveness check with a clear timeframe.
5. Evidence Gaps: Explicitly surface missing data (e.g. calibration records, chromatograms, DCS trend logs) required before final QA closeout.
"""

PROMPT_EXTRACT_CONTEXT = """Analyze the following pharmaceutical API manufacturing incident report, shift log, or deviation email:

{raw_text}

Extract structured investigation data in valid JSON matching this schema:
{{
  "title": "Concise descriptive title of deviation",
  "deviation_number": "Deviation ID or OOS number if mentioned (e.g. DEV-2026-0419) or null",
  "facility": "Facility, building, or suite name or null",
  "product_name": "API product name or null",
  "batch_number": "Lot/Batch number or null",
  "unit_operation": "Process step or unit operation (e.g. Synthesis Step 4, Crystallization, Vacuum Drying) or null",
  "incident_date": "Date and time of incident or null",
  "reported_by": "Reporting analyst or operator or null",
  "investigation_lead": "Lead investigator or engineer or null",
  "observed_event": "Clear factual description of the observed defect or parameter excursion",
  "immediate_containment": "Actions taken immediately to quarantine material or pause processing",
  "suspected_timeline": "Chronological summary of key timestamps or process phases",
  "initial_hypotheses": ["Hypothesis 1", "Hypothesis 2"],
  "supporting_points": ["Fact supporting primary hypothesis"],
  "contradictory_points": ["Fact ruling out other causes or contradicting initial assumptions"]
}}

Return ONLY valid JSON.
"""

PROMPT_FIVE_WHYS = """Perform a rigorous 5 Whys Root Cause Analysis for this API manufacturing deviation:

Observed Event: {observed_event}
Immediate Containment: {immediate_containment}
Unit Operation: {unit_operation}
Additional Context: {context_text}

Progress logically through 5 sequential steps:
Step 1: Immediate physical symptom / mechanism.
Step 2: Underlying direct operational condition.
Step 3: Component, equipment, or procedural failure.
Step 4: Operational management or maintenance process gap.
Step 5: Systemic quality system or design root cause.

Categorize each step as "PHYSICAL", "HUMAN", or "SYSTEMIC".
Return valid JSON matching this schema:
{{
  "root_cause_summary": "Clear, definitive summary of the systemic root cause",
  "steps": [
    {{
      "step_number": 1,
      "question": "Why did [observed event] occur?",
      "answer": "[Direct physical explanation]",
      "category": "PHYSICAL",
      "evidence_reference": "[Log, reading, or parameter reference if available]"
    }},
    ...
    {{
      "step_number": 5,
      "question": "Why did [step 4 failure] occur?",
      "answer": "[Systemic root cause]",
      "category": "SYSTEMIC",
      "evidence_reference": "[Systemic policy or maintenance record reference]"
    }}
  ]
}}

Return ONLY valid JSON.
"""

PROMPT_ISHIKAWA_6M = """Perform a 6M Ishikawa (Fishbone) contributing factor analysis for this API manufacturing deviation:

Observed Event: {observed_event}
Root Cause Summary: {root_cause_summary}
Context: {context_text}

Evaluate all 6 categories:
1. Machine (Equipment, valves, instrumentation, seals, sensors, agitators)
2. Material (Raw materials, reagents, solvents, intermediates, nitrogen supply)
3. Method (SOPs, batch manufacturing records, recipe parameters, recipe limits)
4. Measurement (Analytical testing, PAT probes, thermocouples, pressure gauges, calibration)
5. Man (Operator training, shift handover, execution errors, staffing)
6. Environment (HVAC, ambient humidity, cleanroom classification, utilities like chilled water/glycol)

Return valid JSON:
{{
  "factors": [
    {{
      "category": "Machine",
      "factor": "Specific factor description",
      "is_contributing": true,
      "notes": "Evidence or reasoning explaining why this is contributing or ruled out"
    }},
    ...
  ]
}}

Ensure each of the 6 categories has at least 1-2 evaluated factors.
Return ONLY valid JSON.
"""

PROMPT_EVIDENCE_EVALUATION = """Evaluate the evidence completeness and identify missing records or contradictions for this deviation:

Observed Event: {observed_event}
Root Cause Summary: {root_cause_summary}
Incident Evidence Context: {context_text}

Identify:
1. Supporting Points: Verified data points confirming the suspected mechanism.
2. Contradictory Points: Data points ruling out other possible causes.
3. Missing Evidence Items: Critical GMP records or tests missing from the file that QA will need before investigation approval (e.g., calibration logs, raw chromatograms, cleaning verification, DCS telemetry).
4. Uncertainty Notes: Residual technical uncertainties.

Return valid JSON:
{{
  "supporting_points": ["Point 1", "Point 2"],
  "contradictory_points": ["Point 1", "Point 2"],
  "missing_evidence_items": [
    {{
      "missing_item": "Name of missing record or test (e.g. DCS Historian Temperature Export)",
      "rationale": "Why this evidence is necessary under GMP",
      "impact_level": "HIGH",
      "recommended_action": "Specific task to obtain and verify this record"
    }}
  ],
  "uncertainty_notes": "Summary of remaining risk or assumptions"
}}

Return ONLY valid JSON.
"""

PROMPT_CAPA_RECOMMENDATION = """Formulate an ICH Q10-compliant CAPA plan for this API manufacturing deviation:

Observed Event: {observed_event}
Root Cause Summary: {root_cause_summary}
Contributing Factors: {contributing_factors}
Unit Operation: {unit_operation}

Generate a balanced matrix containing:
1. CONTAINMENT: Immediate quarantine and material disposition controls.
2. CORRECTIVE: Remedial actions addressing the specific physical/operational root cause on this line.
3. PREVENTIVE: Proactive engineering or quality system updates to prevent occurrence across other suites or products.

Every single CAPA item MUST include a defined "effectiveness_criteria" explaining how QA will verify its success.

Return valid JSON:
{{
  "items": [
    {{
      "capa_type": "CONTAINMENT",
      "action_description": "Quarantine affected lot and place intermediate on hold",
      "owner": "QA Warehouse / Operations Lead",
      "target_date": "Immediate (24 hours)",
      "effectiveness_criteria": "ERP block confirmed, physical warning tags affixed",
      "status": "IMPLEMENTED"
    }},
    {{
      "capa_type": "CORRECTIVE",
      "action_description": "Replace failed valve actuator and update local calibration procedure",
      "owner": "Maintenance Engineering Lead",
      "target_date": "14 days",
      "effectiveness_criteria": "Post-repair stroke calibration test passes within +/- 0.5% tolerance",
      "status": "PROPOSED"
    }},
    {{
      "capa_type": "PREVENTIVE",
      "action_description": "Audit preventive maintenance schedules across all synthesis suites",
      "owner": "Director of Technical Services",
      "target_date": "45 days",
      "effectiveness_criteria": "Zero overdue critical valve PMs across 3 consecutive monthly audits",
      "status": "PROPOSED"
    }}
  ]
}}

Return ONLY valid JSON.
"""
