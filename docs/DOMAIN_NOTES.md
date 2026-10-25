# Domain Notes: Root Cause Analysis (RCA) in API Manufacturing

These domain notes establish the regulatory foundations, principles, and product architecture decisions used in **TraceRoot**. They draw strictly from primary regulatory guidance without inventing arbitrary standards or claiming GMP validation.

---

## 1. Primary Sources & Reviewed Sections

### A. FDA Guidance for Industry: Q7 Good Manufacturing Practice Guidance for Active Pharmaceutical Ingredients (ICH Q7, August 2001 / Rev. April 2016)
- **Official URL**: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/q7-good-manufacturing-practice-guidance-active-pharmaceutical-ingredients
- **Sections Reviewed**:
  - **Section 2.16 & 2.17 (Quality Management / Deviations)**:
    - *Guidance statement*: "Any deviation should be documented and explained. Any critical deviation should be investigated and the investigation and its conclusions should be documented."
    - *Application*: Investigations must clearly record deviation references, affected batches/materials, scope, and impact on other lots or concurrent campaigns.
  - **Section 11.15 (Laboratory Controls / Out-of-Specification (OOS) Results)**:
    - *Guidance statement*: Requires thorough investigation into any failure to meet specifications, distinguishing whether the failure is an analytical artifact (laboratory testing error) or a true process/batch defect.
  - **Section 13.13 (Production and In-Process Controls / Deviation Investigations)**:
    - *Guidance statement*: Critical deviations require determination of root cause and evaluation of whether other batches or products are potentially compromised.

### B. ICH Harmonised Tripartite Guideline: Q10 Pharmaceutical Quality System (June 2008)
- **Official URL**: https://database.ich.org/sites/default/files/Q10%20Guideline.pdf
- **Sections Reviewed**:
  - **Section 3.2.2 (Corrective Action and Preventive Action (CAPA) System)**:
    - *Guidance statement*: "The pharmaceutical company should have a system for implementing corrective actions and preventive actions resulting from the investigation of complaints, product rejections, non-conformances, recalls, deviations, audits, regulatory inspections and findings, and trends from process performance and product quality monitoring."
    - *Methodology Requirement*: "A structured approach to the investigation process should be used with the objective of determining the root cause."
    - *Risk Calibration*: "The level of effort, formality, and documentation of the investigation should be commensurate with the level of risk."
    - *Effectiveness Verification*: CAPA effectiveness must be monitored to ensure the root cause was eliminated and no unintended consequences were introduced.

---

## 2. Core Domain Principles and Distinctions

### Observed Event vs. Suspected Cause vs. Root Cause
- **Observed Event**: The factual, empirical symptom noticed in the production plant or quality control laboratory (e.g., *"Batch 2026-API-088 exhibited an unexpected unknown impurity peak at RRT 1.42 during release HPLC testing (0.24% vs limit 0.10%)"* or *"Loss of temperature control on C-301 Crystallizer jacket during slow cooling ramp"*).
- **Suspected Cause**: Initial working hypotheses proposed by operators, technicians, or process engineers prior to completing evidentiary verification (e.g., *"Suspected faulty thermocouple probe or cooling water valve sticking"*).
- **Root Cause**: The foundational physical, procedural, or systemic mechanism which, if removed or corrected, prevents recurrence (e.g., *"Failure of nitrogen seal gas regulator diaphragm leading to periodic micro-ingress of ambient moisture during crystallization hold time"*).
- **Product Implication**: TraceRoot enforces an explicit data distinction between the immutable **Observed Event (Incident Context)** and mutable, editable **Root Cause & 5 Whys Analysis**. Users cannot accidentally treat hypotheses as verified facts.

### Supporting Evidence vs. Contradictory Evidence
- Traditional investigations often suffer from confirmation bias: investigators search exclusively for data confirming their first hunch.
- **Supporting Evidence**: Physical logs, SCADA/DCS temperature records, calibration certificates, raw batch records, or chromatograms that corroborate a hypothesis.
- **Contradictory Evidence**: Data points that actively disprove or fail to align with a proposed cause (e.g., *"Chilled water supply header temperature was verified within 4–6°C throughout the shift, ruling out central utility failure"*).
- **Product Implication**: TraceRoot's evidence module and AI reasoning prompts explicitly solicit and categorize both supporting and contradictory findings. Gaps and contradictory findings are highlighted to prevent prematurely closing an investigation on weak assumptions.

### Immediate Containment vs. Corrective Action vs. Preventive Action
- **Containment (Immediate Action)**: Short-term risk mitigation enacted immediately upon discovery to halt further exposure (e.g., *"Place Lot 2026-API-088 on physical and ERP Quality Hold; quarantine intermediate IBC totes; pause packaging line"*). Containment does not fix the root cause.
- **Corrective Action (CA)**: Remedial action taken to eliminate the identified root cause of an existing non-conformity to prevent its repetition (e.g., *"Replace damaged pneumatic diaphragm on nitrogen pressure control valve PRV-204 and rebuild regulator assembly"*).
- **Preventive Action (PA)**: Proactive measure taken to eliminate the cause of a potential non-conformity in similar equipment, adjacent production lines, or future process trains (e.g., *"Update PM schedule PM-VALV-04 to mandate bi-annual elastomer replacement across all crystallization suites (C-101 through C-304)"*).
- **Product Implication**: TraceRoot structures CAPA recommendations into distinct tabs/tables for Containment, Corrective Actions, and Preventive Actions, preventing teams from conflating temporary quarantine holds with permanent process fixes.

### Investigation Uncertainty & Effectiveness Checks
- Real-world pharmaceutical investigations must deal with missing or noisy data (e.g., an uncalibrated local gauge, missing shift handover log, or intermittent sensor drift).
- An investigation is incomplete without an **Effectiveness Check Plan** (ICH Q10 §3.2.2):
  - Pre-defined acceptance criteria (e.g., *"Zero unexplained impurity peaks across the next 5 consecutive commercial API batches"*).
  - Explicit evaluation date and responsible owner.
  - Review method (e.g., *"Statistical trend review of HPLC chromatograms at day 90"*).
- **Product Implication**: TraceRoot generates and tracks explicit "Effectiveness Checks" tied directly to each CAPA item, including review intervals and quantitative criteria.

---

## 3. Product Architecture Decisions Informed by Guidance

1. **AI as an Investigation Partner, Not an Autonomous Sign-Off**:
   - Regulatory frameworks require quality unit accountability. TraceRoot designs the AI as an interactive co-pilot that drafts, cross-checks, and prompts for missing data, while the human investigator reviews, refines, and accepts/rejects every claim.
2. **Structured 5-Whys Progression**:
   - The 5 Whys chain is modeled as an ordered step array, capturing question, answer, evidence link, and category (Physical Cause, Human Failure, Systemic / Procedural Defect).
3. **Ishikawa (6M) Analysis**:
   - Fishbone categories (Material, Machine, Method, Measurement, Man, Environment) provide systemic coverage to ensure investigators do not stop at operator error.
4. **Evidence Gaps / Missing Evidence Callouts**:
   - The AI identifies records that *should* exist according to good API manufacturing practices (e.g., cleaning validation swab logs, DCS historian trend exports, supplier COAs) that were omitted in the incident narrative.
5. **No Regulatory Overreach**:
   - TraceRoot does not claim 21 CFR Part 11 or GAMP 5 automated compliance. It provides audit-ready data models with clean timestamps and change-tracking suitable for professional engineering review.
