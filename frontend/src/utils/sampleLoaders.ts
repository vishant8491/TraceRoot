export interface SampleIncident {
  key: string;
  name: string;
  deviationNumber: string;
  product: string;
  description: string;
  sourceType: 'PDF' | 'TEXT' | 'EMAIL';
  rawText: string;
  emailFields?: {
    subject: string;
    from: string;
    date: string;
    to: string;
  };
}

export const SAMPLE_INCIDENTS: SampleIncident[] = [
  {
    key: 'rosuvastatin_thf_oos',
    name: '[SYNTHETIC] Sample 1: Documented Observations with Missing Evidence (Rosuvastatin API)',
    deviationNumber: 'DEV-SYN-2026-0801',
    product: 'Rosuvastatin Calcium API (Synthetic Demo)',
    description: 'High residual THF solvent excursion (0.82% w/w vs limit <= 0.50% w/w). Process records documented, but vacuum condenser chilled water delta-T log is missing due to sensor failure.',
    sourceType: 'PDF',
    rawText: `[SYNTHETIC INVESTIGATION RECORD - FICTIONAL DEMO MATERIAL]
DEVIATION REPORT: DEV-SYN-2026-0801
PRODUCT: Rosuvastatin Calcium API (Synthetic Demo)
BATCH NUMBER: RSC-SYN-2026-801
MANUFACTURING STAGE: Step 6: Vacuum Condensation & Solvent Stripping
FACILITY / SITE: API Production Complex 2, Vacuum Isolation Suite
EQUIPMENT: Agitated Nutsche Filter Dryer NFD-301 & Vacuum Condenser VC-302
DATE OF INCIDENT: 2026-10-18 11:20 UTC
INVESTIGATOR: Dr. Aris Thorne (Lead Process Chemist - Synthetic Demo)

OBSERVED DEVIATION:
During finished lot release testing of Rosuvastatin Calcium API lot RSC-SYN-2026-801, Headspace Gas Chromatography (GC-FID) detected residual Tetrahydrofuran (THF) at 0.82% w/w (8,200 ppm).
Acceptance Criteria: Residual THF must be <= 0.50% w/w (5,000 ppm) per ICH Q3C Table 2 (Class 2 Solvent limit).
All other residual solvents (ethanol, ethyl acetate, heptane) tested below 50 ppm.

EXPECTED CONDITION:
Residual THF <= 0.50% w/w. Vacuum drying profile DRY-RSC-04 maintained at 45.0 C jacket temperature and chamber vacuum <= -0.095 MPa for 16.0 hours.

ACTUAL CONDITION:
Finished lot measured 0.82% w/w residual THF. NFD-301 vacuum chamber pressure log logged -0.096 MPa throughout drying.
However, vacuum condenser VC-302 chilled water differential temperature (delta-T across inlet/outlet) is completely absent from the batch record because secondary flow sensor FT-302 was offline for unscheduled calibration.

IMMEDIATE CONTAINMENT:
1. Drum lot RSC-SYN-2026-801 (182.4 kg dry powder) placed under QA Quarantine Hold in Vault V-02.
2. Downstream micronization and blending operations for lot RSC-SYN-2026-801 suspended.
3. Upstream mother liquor wash batch RSC-SYN-2026-802 placed on administrative hold in intermediate vessel TK-301.

KNOWN PROCESS OBSERVATIONS & MISSING EVIDENCE:
- Batch drying history confirms agitator forward/reverse cycle operated normally at 8 RPM.
- Condenser receiver sight glass showed solvent condensate collection ceased after hour 6 of the 16-hour cycle, which is abnormally premature for a 500-liter solvent load.
- CRITICAL MISSING EVIDENCE: Secondary condenser cooling water inlet temperature and return temperature delta-T telemetry was unrecorded from 02:00 to 10:00 UTC due to instrumentation power supply tripping. Whether condenser efficiency was degraded during primary evaporation cannot be verified from available logs without utility plant records.`
  },
  {
    key: 'valsartan_sparse_email',
    name: '[SYNTHETIC] Sample 2: Sparse Incident - Insufficient Evidence Outcome (Valsartan API)',
    deviationNumber: 'DEV-SYN-2026-0014',
    product: 'Valsartan API (Synthetic Demo)',
    description: 'Informal shift supervisor email reporting visual murkiness in crude solution tank. Zero analytical data, HPLC assays, or turbidity measurements attached. Correct outcome: Insufficient initial evidence.',
    sourceType: 'EMAIL',
    emailFields: {
      subject: 'Fwd: Murky crude solution observed in Tank TK-102 batch VAL-SYN-2026-014',
      from: 'dave.miller.ops@synthetic-pharma.internal',
      date: '2026-10-21 04:15 UTC',
      to: 'qa-deviations@synthetic-pharma.internal, shift-supervisors@synthetic-pharma.internal',
    },
    rawText: `From: dave.miller.ops@synthetic-pharma.internal
To: qa-deviations@synthetic-pharma.internal, shift-supervisors@synthetic-pharma.internal
Date: 2026-10-21 04:15 UTC
Subject: Fwd: Murky crude solution observed in Tank TK-102 batch VAL-SYN-2026-014

[SYNTHETIC INCIDENT RECORD - FICTIONAL DEMO MATERIAL]
QA Team,

Writing this quick note from the night shift floor.
During Step 3 crude dissolution of Valsartan batch VAL-SYN-2026-014 in Tank TK-102, operator noticed the solution looked unusually hazy/murky through the top sight glass right before carbon addition.
Normally this crude stream looks clear amber, but tonight it looked like iced tea with slight turbidity.

We did not pull an analytical QC sample or run turbidity (NTU), UV-Vis, or HPLC because the lab was closed on night shift.
Operator suspects maybe the solvent ratio was off or raw material lot of ethyl acetate was contaminated, but we have no test numbers or sensor charts to back that up.

Containment taken: We kept the tank agitator running on low speed (20 rpm) and told Shift A morning crew not to pump forward to the polish filter until QA takes a look.

Please advise what tests we need to pull before we do anything else.

Dave Miller
Night Operations Supervisor
API Synthesis Unit 1 (Synthetic Demo)`
  },
  {
    key: 'pregabalin_conflicting_records',
    name: '[SYNTHETIC] Sample 3: Conflicting Records - Operator Claim vs SCADA DCS (Pregabalin API)',
    deviationNumber: 'DEV-SYN-2026-0552',
    product: 'Pregabalin API (Synthetic Demo)',
    description: 'Mother liquor distillation yield deficit (-24.5%). Shift handover asserts "operator error" leaving manual drain valve open, but SCADA DCS automated historian reveals pneumatic instrument air failure caused fail-open actuator drift.',
    sourceType: 'TEXT',
    rawText: `[SYNTHETIC INVESTIGATION RECORD - FICTIONAL DEMO MATERIAL]
INCIDENT INVESTIGATION DOSSIER: DEV-SYN-2026-0552
PRODUCT: Pregabalin API (Synthetic Demo)
BATCH: PGB-SYN-2026-552
MANUFACTURING STAGE: Step 5: Mother Liquor Distillation & Solvent Recovery
EQUIPMENT: Distillation Column DC-101 & Pneumatic Bottoms Drain Valve V-104
INCIDENT DATE: 2026-10-22 14:45 UTC
INVESTIGATOR: Elena Rostova (Senior QA Compliance Auditor - Synthetic Demo)

OBSERVED DEVIATION:
During mother liquor concentration of Pregabalin batch PGB-SYN-2026-552 in Distillation Column DC-101, recovered intermediate yield was 68.2 kg against an expected range of 88.0 - 92.0 kg (24.5% yield deficit). Analytical testing of the condensate wash receiver WR-105 confirmed 21.8 kg of dissolved Pregabalin intermediate had migrated into the waste wash stream.

EXPECTED CONDITION:
Intermediate yield between 88.0 - 92.0 kg. Pneumatic drain valve V-104 must remain 100% seated shut during the 4.0-hour total reflux distillation cycle.

ACTUAL CONDITION:
Yield was 68.2 kg. 21.8 kg product diverted into wash receiver.

RECORD CONFLICT #1 - OPERATOR SHIFT LOG STATEMENT (REPORTED CLAIM):
Shift Handover Log Book (Shift B entry by Supervisor T. Higgins):
"Shift B took over distillation at 14:00 UTC. Operator discovered bottom isolation valve V-104 was unlatched and weeping liquid into the wash header. Root cause is operator error by Shift A technician who failed to verify manual valve locking pin before starting vacuum pull. Operator retightened manual clamp at 14:25 UTC."

RECORD CONFLICT #2 - SCADA DCS AUTOMATED TREND & HISTORIAN AUDIT (MEASURED DATA):
DCS Central Historian Audit Log for Distillation Skid DC-101 (Tag: PV-104-POS / PT-AIR-08):
- At 13:48 UTC, main instrument air supply header pressure PT-AIR-08 dropped from 6.2 bar to 0.1 bar due to a compressor dryer desiccant valve freeze in the central utility building.
- Valve V-104 is configured as a pneumatic fail-open safety valve with a mechanical spring actuator.
- When pneumatic supply pressure dropped below 1.5 bar at 13:51 UTC, the actuator spring overcame the remaining pressure and drifted the valve plug open to approximately 35% position.
- SCADA automated alarm 'INSTRUMENT AIR LOW PRESSURE' activated at 13:52 UTC on the utility console, but was unacknowledged on the API synthesis console.
- Manual valve locking pin was found to have been sheared during the actuator drift, proving valve opening was mechanically driven by pressure loss, not manual operator manipulation.

EPISTEMOLOGICAL NOTE & REGULATORY EVALUATION:
The supervisor shift log claim of 'operator error' is a subjective reported claim contradicted by objective SCADA time-series telemetry. ICH Q9(R1) and WHO TRS 986 require evidence-based root cause determination rather than unsubstantiated human error attribution.`
  }
];
