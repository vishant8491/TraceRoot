import pytest
import asyncio
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.models.ai_run import AIRun
from app.main import app
from tests.conftest import TestSessionLocal


@pytest.mark.asyncio
async def test_health_route():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "healthy"
        assert "database" in data


@pytest.mark.asyncio
async def test_create_and_get_investigation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "title": "Crystallizer Excursion Investigation",
            "product_name": "Atorvastatin Calcium API",
            "batch_number": "ATC-2026-042",
            "manufacturing_stage": "Finishing Crystallization",
            "observed_deviation": "Cooling rate 1.86 C/min vs 0.5 C/min specification limit.",
            "expected_condition": "Controlled linear cooling at 0.5 C/min",
            "actual_condition": "Rapid shock cooling to 28.5 C in 18 minutes",
            "immediate_containment": "Agitation lowered to 25 rpm. Lot quarantined.",
            "investigator_name": "Maria Santos",
        }
        res = await client.post("/api/investigations", json=payload)
        assert res.status_code == 201
        created = res.json()
        assert created["id"] is not None
        assert created["investigation_number"].startswith("INV-")
        assert created["version"] == 1
        assert created["status"] == "DRAFT"

        # Fetch by ID
        get_res = await client.get(f"/api/investigations/{created['id']}")
        assert get_res.status_code == 200
        fetched = get_res.json()
        assert fetched["product_name"] == "Atorvastatin Calcium API"
        assert fetched["version"] == 1


@pytest.mark.asyncio
async def test_optimistic_concurrency_patch():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create
        create_res = await client.post("/api/investigations", json={"title": "Concurrency Test"})
        assert create_res.status_code == 201
        inv = create_res.json()
        inv_id = inv["id"]
        assert inv["version"] == 1

        # Valid update with version 1 -> increments to 2
        patch_res = await client.patch(
            f"/api/investigations/{inv_id}",
            json={"version": 1, "title": "Updated Title Version 2"}
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["version"] == 2
        assert updated["title"] == "Updated Title Version 2"

        # Stale update submitting version 1 again -> must return 409 Conflict
        stale_res = await client.patch(
            f"/api/investigations/{inv_id}",
            json={"version": 1, "title": "Stale Update"}
        )
        assert stale_res.status_code == 409
        error_body = stale_res.json()
        assert error_body["error"]["code"] == "CONCURRENCY_CONFLICT"
        assert "version is 2" in error_body["error"]["message"]


@pytest.mark.asyncio
async def test_revert_reviewed_to_draft_on_edit():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post("/api/investigations", json={"title": "Review Revert Test"})
        inv_id = create_res.json()["id"]

        # Directly simulate reviewed state
        async with TestSessionLocal() as session:
            from app.models.investigation import Investigation
            from sqlalchemy import select
            item = (await session.execute(select(Investigation).where(Investigation.id == inv_id))).scalar_one()
            item.status = "REVIEWED"
            await session.commit()

        # Check status is REVIEWED
        check = await client.get(f"/api/investigations/{inv_id}")
        assert check.json()["status"] == "REVIEWED"

        # Edit investigation
        patch_res = await client.patch(
            f"/api/investigations/{inv_id}",
            json={"version": 1, "title": "Modified Title"}
        )
        assert patch_res.status_code == 200
        # Must return to DRAFT
        assert patch_res.json()["status"] == "DRAFT"


@pytest.mark.asyncio
async def test_add_and_get_source_document():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post("/api/investigations", json={"title": "Source Test"})
        inv_id = create_res.json()["id"]

        text_content = (
            "Paragraph 1: During trityl deprotection in reactor R-201, temperature rose to 58.4 C.\n\n"
            "Paragraph 2: TCV-201 valve actuator diaphragm ruptured, preventing cooling."
        )
        source_res = await client.post(
            f"/api/investigations/{inv_id}/sources",
            data={
                "source_type": "TEXT",
                "display_name": "Synthesis_Log_R201.txt",
                "text_content": text_content,
            }
        )
        assert source_res.status_code == 201
        source = source_res.json()
        assert source["id"] is not None
        assert len(source["segments"]) >= 2
        assert len(source["content_hash"]) == 64

        # Fetch source by ID
        get_src = await client.get(f"/api/investigations/{inv_id}/sources/{source['id']}")
        assert get_src.status_code == 200
        assert get_src.json()["display_name"] == "Synthesis_Log_R201.txt"

        # Fetch with wrong investigation id -> must return 404
        wrong_inv_get = await client.get(f"/api/investigations/wrong-id/sources/{source['id']}")
        assert wrong_inv_get.status_code == 404


@pytest.mark.asyncio
async def test_ai_analysis_and_prevent_duplicate_concurrent_runs():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/api/investigations",
            json={
                "title": "Analysis Test",
                "observed_deviation": "OOS Unknown Impurity RRT 1.42 (0.28% vs 0.10%)",
                "product_name": "Candesartan Cilexetil API",
            }
        )
        inv_id = create_res.json()["id"]

        # Attach a source
        await client.post(
            f"/api/investigations/{inv_id}/sources",
            data={
                "display_name": "QC_OOS_Record.txt",
                "text_content": "HPLC testing of batch CC-2026-B089 showed 0.28% unknown impurity. Reactor R-201 ran hot.",
            }
        )

        # 1. Simulate an existing active run to verify concurrent run prevention (409)
        async with TestSessionLocal() as session:
            active_run = AIRun(
                investigation_id=inv_id,
                draft_version=1,
                status="RUNNING",
                completed_stages=["INGESTION"],
                model_id="test-model",
                started_at=datetime.now(timezone.utc),
            )
            session.add(active_run)
            await session.commit()

        # Attempt to launch concurrent analyze -> must return 409 CONCURRENT_RUN_IN_PROGRESS
        dup_res = await client.post(f"/api/investigations/{inv_id}/analyze")
        assert dup_res.status_code == 409
        dup_err = dup_res.json()
        assert dup_err["error"]["code"] == "CONCURRENT_RUN_IN_PROGRESS"

        # 2. Mark the dummy run as completed so we can trigger a real analysis pipeline
        async with TestSessionLocal() as session:
            stmt = select(AIRun).where(AIRun.investigation_id == inv_id)
            runs = (await session.execute(stmt)).scalars().all()
            for r in runs:
                r.status = "COMPLETED"
                r.finished_at = datetime.now(timezone.utc)
            await session.commit()

        # 3. Trigger fresh analysis pipeline
        run_res = await client.post(f"/api/investigations/{inv_id}/analyze")
        assert run_res.status_code == 202
        run_data = run_res.json()
        run_id = run_data["id"]

        # Wait for background task to complete
        for _ in range(20):
            await asyncio.sleep(0.1)
            poll = await client.get(f"/api/investigations/{inv_id}/runs/{run_id}")
            if poll.json()["status"] == "COMPLETED":
                break

        final_run = (await client.get(f"/api/investigations/{inv_id}/runs/{run_id}")).json()
        assert final_run["status"] == "COMPLETED"
        assert len(final_run["completed_stages"]) >= 5
        assert final_run["structured_output"] is not None

        # Verify investigation content was updated atomically
        inv_check = (await client.get(f"/api/investigations/{inv_id}")).json()
        assert len(inv_check["content"]["five_whys"]) >= 5
        assert len(inv_check["content"]["capa_suggestions"]) >= 3


@pytest.mark.asyncio
async def test_review_endpoint_unreviewed_rejection_and_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/api/investigations",
            json={"title": "Review Workflow Test"}
        )
        inv_id = create_res.json()["id"]

        # Add source & run analysis
        await client.post(
            f"/api/investigations/{inv_id}/sources",
            data={
                "display_name": "Incident_Text.txt",
                "text_content": "Lot CLO-26-881 showed high acetone 6,420 ppm due to condenser trip.",
            }
        )
        run_res = await client.post(f"/api/investigations/{inv_id}/analyze")
        run_id = run_res.json()["id"]

        for _ in range(20):
            await asyncio.sleep(0.1)
            poll = await client.get(f"/api/investigations/{inv_id}/runs/{run_id}")
            if poll.json()["status"] == "COMPLETED":
                break

        inv_current = (await client.get(f"/api/investigations/{inv_id}")).json()
        curr_ver = inv_current["version"]

        # Try to mark REVIEWED without reviewing AI content -> must return 422 UNREVIEWED_CONTENT_REMAINING
        fail_review = await client.post(
            f"/api/investigations/{inv_id}/review",
            json={
                "version": curr_ver,
                "reviewer_name": "Dr. Eleanor Vance",
                "decisions": {},
            }
        )
        assert fail_review.status_code == 422
        assert fail_review.json()["error"]["code"] == "UNREVIEWED_CONTENT_REMAINING"

        # Provide explicit review decisions for all populated AI items
        decisions = {}
        for k in inv_current["content"]["field_provenance"].keys():
            decisions[f"field:{k}"] = {
                "decision_state": "ACCEPTED",
                "decided_by": "Dr. Eleanor Vance",
                "comment": "Verified against raw chromatogram and batch record.",
            }
        for idx in range(len(inv_current["content"]["five_whys"])):
            decisions[f"five_whys:{idx}"] = {
                "decision_state": "ACCEPTED",
                "decided_by": "Dr. Eleanor Vance",
            }
        for idx in range(len(inv_current["content"]["capa_suggestions"])):
            decisions[f"capa:{idx}"] = {
                "decision_state": "ACCEPTED",
                "decided_by": "Dr. Eleanor Vance",
            }

        success_review = await client.post(
            f"/api/investigations/{inv_id}/review",
            json={
                "version": curr_ver,
                "reviewer_name": "Dr. Eleanor Vance",
                "decisions": decisions,
                "comment": "Preliminary technical review completed.",
            }
        )
        assert success_review.status_code == 200
        review_data = success_review.json()
        assert review_data["investigation"]["status"] == "REVIEWED"
        assert review_data["investigation"]["reviewer_name"] == "Dr. Eleanor Vance"
        assert "not qualified regulatory approval" in review_data["disclaimer"]
