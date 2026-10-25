import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.investigation import Investigation, default_investigation_content
from app.models.source_document import SourceDocument
from app.services.segmenter import (
    segment_text_content,
    segment_pdf_pages,
    parse_and_format_email,
    compute_content_hash,
)
from app.services.rca_engine import execute_provenance_rca

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_samples")


SYNTHETIC_SAMPLES = [
  {
    "investigation_number": "INV-2026-SYN-0001",
    "title": "[SYNTHETIC] Residual THF Solvent Excursion in Rosuvastatin Calcium API Lot RSC-SYN-2026-801",
    "product_name": "Rosuvastatin Calcium API (Synthetic Demo)",
    "batch_number": "RSC-SYN-2026-801",
    "manufacturing_stage": "Step 6: Vacuum Condensation & Solvent Stripping",
    "incident_date": "2026-10-18 11:20 UTC",
    "site_department": "API Production Complex 2, Vacuum Isolation Suite",
    "equipment": "Agitated Nutsche Filter Dryer NFD-301 & Vacuum Condenser VC-302",
    "observed_deviation": "Individual residual Tetrahydrofuran (THF) level measured at 0.82% w/w via Headspace GC, exceeding ICH Q3C Class 2 limit of NMT 0.50% w/w. Detailed process logs available, but condenser cooling water delta-T telemetry is missing.",
    "expected_condition": "Residual THF <= 0.50% w/w (5000 ppm); drying vacuum maintained at <= -0.095 MPa.",
    "actual_condition": "Residual THF measured at 0.82% w/w (8200 ppm); vacuum condenser chilled water delta-T log unrecorded due to offline telemetry sensor.",
    "immediate_containment": "Finished drum lot RSC-SYN-2026-801 (182.4 kg) quarantined under QA Hold in Vault V-02. Downstream micronization line suspended.",
    "investigator_name": "Dr. Aris Thorne (Lead Process Chemist - Synthetic Demo)",
    "source_doc": {
      "source_type": "PDF",
      "display_name": "DEV-SYN-2026-0801_Rosuvastatin_Solvent_Investigation.pdf",
      "pages": [
        (1, """[SYNTHETIC INVESTIGATION RECORD - FICTIONAL DEMO MATERIAL]
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
All other residual solvents (ethanol, ethyl acetate, heptane) tested below 50 ppm."""),
        (2, """EXPECTED CONDITION:
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
- CRITICAL MISSING EVIDENCE: Secondary condenser cooling water inlet temperature and return temperature delta-T telemetry was unrecorded from 02:00 to 10:00 UTC due to instrumentation power supply tripping. Whether condenser efficiency was degraded during primary evaporation cannot be verified from available logs without utility plant records.""")
      ]
    }
  },
  {
    "investigation_number": "INV-2026-SYN-0002",
    "title": "[SYNTHETIC] Sparse Email: Visual Murkiness in Valsartan Crude Solution Lot VAL-SYN-2026-014",
    "product_name": "Valsartan API (Synthetic Demo)",
    "batch_number": "VAL-SYN-2026-014",
    "manufacturing_stage": "Step 3: Crude Dissolution & Clarification",
    "incident_date": "2026-10-21 04:15 UTC",
    "site_department": "API Synthesis Unit 1",
    "equipment": "Dissolution Tank TK-102",
    "observed_deviation": "Informal shift supervisor email reporting visual murkiness in crude solution tank. Zero analytical data, HPLC assays, or turbidity measurements attached. Correct outcome: Insufficient initial evidence.",
    "expected_condition": "Clear amber solution without haze; quantitative turbidity <= 5.0 NTU.",
    "actual_condition": "Subjective visual cloudiness reported in informal email; zero quantitative metrics or analytical test results attached.",
    "immediate_containment": "Tank TK-102 agitation maintained on low speed (20 rpm); filtration held until QA review.",
    "investigator_name": "Dave Miller (Night Operations Supervisor - Synthetic Demo)",
    "source_doc": {
      "source_type": "EMAIL",
      "display_name": "Email: Fwd: Murky crude solution observed in Tank TK-102 batch VAL-SYN-2026-014",
      "email_subject": "Fwd: Murky crude solution observed in Tank TK-102 batch VAL-SYN-2026-014",
      "email_from": "dave.miller.ops@synthetic-pharma.internal",
      "email_date": "2026-10-21 04:15 UTC",
      "email_to": "qa-deviations@synthetic-pharma.internal, shift-supervisors@synthetic-pharma.internal",
      "text": """[SYNTHETIC INCIDENT RECORD - FICTIONAL DEMO MATERIAL]
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
API Synthesis Unit 1 (Synthetic Demo)"""
    }
  },
  {
    "investigation_number": "INV-2026-SYN-0003",
    "title": "[SYNTHETIC] Conflicting Records: Yield Loss in Pregabalin Intermediate Lot PGB-SYN-2026-552",
    "product_name": "Pregabalin API (Synthetic Demo)",
    "batch_number": "PGB-SYN-2026-552",
    "manufacturing_stage": "Step 5: Mother Liquor Distillation & Solvent Recovery",
    "incident_date": "2026-10-22 14:45 UTC",
    "site_department": "Solvent Recovery Plant SR-3",
    "equipment": "Distillation Column DC-101 & Pneumatic Bottoms Drain Valve V-104",
    "observed_deviation": "Mother liquor distillation yield deficit (-24.5%). Shift log asserts 'operator error' leaving manual drain valve open, but SCADA DCS automated historian reveals pneumatic instrument air failure caused fail-open actuator drift.",
    "expected_condition": "Intermediate yield between 88.0 - 92.0 kg; pneumatic drain valve V-104 seated shut during distillation.",
    "actual_condition": "Yield was 68.2 kg. Operator claimed human error, but SCADA historian proved instrument air pressure dropped to 0.1 bar causing fail-open actuator drift.",
    "immediate_containment": "Wash receiver isolated; 21.8 kg product solution impounded for recovery evaluation.",
    "investigator_name": "Elena Rostova (Senior QA Compliance Auditor - Synthetic Demo)",
    "source_doc": {
      "source_type": "TEXT",
      "display_name": "Handover_Log_and_SCADA_Telemetry_Audit.txt",
      "text": """[SYNTHETIC INVESTIGATION RECORD - FICTIONAL DEMO MATERIAL]
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
The supervisor shift log claim of 'operator error' is a subjective reported claim contradicted by objective SCADA time-series telemetry. ICH Q9(R1) and WHO TRS 986 require evidence-based root cause determination rather than unsubstantiated human error attribution."""
    }
  }
]


async def seed_synthetic_samples():
    """
    Idempotent, non-destructive sample seeder.
    Creates or updates the 3 synthetic demo investigations with deterministic segmentation.
    """
    from app.database import engine, Base, switch_to_sqlite_fallback
    import app.database as database
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        logger.warning(f"PostgreSQL connection check failed ({e}). Using SQLite fallback.")
        fallback_engine = switch_to_sqlite_fallback()
        async with fallback_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    logger.info("Checking synthetic sample investigations...")
    async with database.AsyncSessionLocal() as session:
        for item in SYNTHETIC_SAMPLES:
            inv_num = item["investigation_number"]
            stmt = select(Investigation).where(Investigation.investigation_number == inv_num)
            existing = (await session.execute(stmt)).scalar_one_or_none()

            if existing:
                logger.info(f"Sample {inv_num} already exists in database; skipping.")
                continue

            logger.info(f"Seeding synthetic investigation {inv_num}: {item['title']}")
            inv = Investigation(
                investigation_number=inv_num,
                title=item["title"],
                status="DRAFT",
                product_name=item["product_name"],
                batch_number=item["batch_number"],
                manufacturing_stage=item["manufacturing_stage"],
                incident_date=item["incident_date"],
                site_department=item["site_department"],
                equipment=item["equipment"],
                observed_deviation=item["observed_deviation"],
                expected_condition=item["expected_condition"],
                actual_condition=item["actual_condition"],
                immediate_containment=item["immediate_containment"],
                investigator_name=item["investigator_name"],
                version=1,
                content=default_investigation_content(),
            )
            session.add(inv)
            await session.flush()  # Generate inv.id

            # Segment attached SourceDocument deterministically
            src_info = item["source_doc"]
            src_type = src_info["source_type"]

            if src_type == "PDF":
                full_text, segments = segment_pdf_pages(src_info["pages"])
            elif src_type == "EMAIL":
                full_text, segments = parse_and_format_email(
                    raw_text=src_info["text"],
                    subject=src_info.get("email_subject"),
                    from_addr=src_info.get("email_from"),
                    date_str=src_info.get("email_date"),
                    to_addr=src_info.get("email_to"),
                )
            else:
                full_text = src_info["text"]
                segments = segment_text_content(full_text, prefix="s")

            content_hash = compute_content_hash(full_text)
            source_doc = SourceDocument(
                investigation_id=inv.id,
                source_type=src_type,
                display_name=src_info["display_name"],
                extracted_text=full_text,
                segments=segments,
                content_hash=content_hash,
            )
            session.add(source_doc)
            await session.flush()

            # Execute provenance RCA analysis to seed initial validated structured output
            _, structured_output = execute_provenance_rca(
                sources=[source_doc],
                existing_fields={
                    "product_name": inv.product_name,
                    "batch_number": inv.batch_number,
                    "observed_deviation": inv.observed_deviation,
                    "expected_condition": inv.expected_condition,
                    "actual_condition": inv.actual_condition,
                    "immediate_containment": inv.immediate_containment,
                }
            )
            inv.content = structured_output
            await session.commit()
            logger.info(f"Successfully seeded {inv_num} with attached source document ({len(segments)} segments) and structured RCA provenance.")

    logger.info("Sample seeding verification completed.")


if __name__ == "__main__":
    asyncio.run(seed_synthetic_samples())
