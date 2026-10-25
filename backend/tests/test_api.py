import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_check():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check both /health and /api/health
        res1 = await client.get("/health")
        assert res1.status_code == 200
        assert res1.json()["status"] == "healthy"

        res2 = await client.get("/api/health")
        assert res2.status_code == 200
        assert res2.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_create_and_get_investigation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "title": "DEV-2026-0419 Candesartan OOS Investigation",
            "product_name": "Candesartan Cilexetil API",
            "batch_number": "CC-2026-B089",
            "manufacturing_stage": "Synthesis Step 4 (Deprotection)",
            "observed_deviation": "HPLC peak at RRT 1.42 measuring 0.28% vs specification NMT 0.10%",
            "expected_condition": "Individual unknown impurity <= 0.10% w/w",
            "actual_condition": "Impurity measured at 0.28% w/w",
            "immediate_containment": "Quarantined in Drum Storage D-12",
            "investigator_name": "Dr. Evelyn Reed",
        }
        res = await client.post("/api/investigations", json=payload)
        assert res.status_code == 201
        created = res.json()
        assert created["id"] is not None
        assert created["investigation_number"].startswith("INV-")
        assert created["status"] == "DRAFT"
        assert created["version"] == 1

        # Fetch by ID
        get_res = await client.get(f"/api/investigations/{created['id']}")
        assert get_res.status_code == 200
        fetched = get_res.json()
        assert fetched["product_name"] == "Candesartan Cilexetil API"
        assert fetched["version"] == 1


@pytest.mark.asyncio
async def test_source_segmentation_contract():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/api/investigations",
            json={"title": "Source Segment Test"}
        )
        inv_id = create_res.json()["id"]

        source_payload = {
            "display_name": "Deviation_Summary.txt",
            "text_content": (
                "DEVIATION ID: DEV-2026-0504\n\n"
                "PRODUCT: Atorvastatin Calcium Trihydrate API\n"
                "BATCH: ATC-2026-042\n\n"
                "OBSERVED EVENT: Crystallizer CR-401 temperature crashed to 28.5C.\n\n"
                "CONTAINMENT: Crystallizer agitator lowered to 25 rpm. Lot quarantined."
            )
        }
        res = await client.post(f"/api/investigations/{inv_id}/sources", data=source_payload)
        assert res.status_code == 201
        source_data = res.json()
        assert source_data["content_hash"] is not None
        assert len(source_data["segments"]) >= 4
        # Verify stable segment structure
        first_segment = source_data["segments"][0]
        assert "segment_id" in first_segment
        assert "text" in first_segment
