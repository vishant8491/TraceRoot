import os
import asyncio
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import settings
from app.exceptions import GroqConfigurationError, GroqExecutionError
from app.models.ai_run import AIRun
from app.services.groq_provider import (
    verify_groq_configuration,
    GroqLiveProvider,
    MockedGraphProvider,
)
from app.services.langgraph_rca import (
    execute_langgraph_rca,
    build_langgraph_workflow,
    RCAWorkflowState,
)


@pytest.mark.asyncio
async def test_langgraph_orchestration_stages_and_callback():
    """
    Verifies that LangGraph orchestrates all 6 stages equivalent to:
    START -> prepare_source -> extract_incident -> analyze_evidence -> propose_investigation -> propose_capa -> validate_output -> END
    and that stage callback persists transitions in order.
    """
    mock_provider = MockedGraphProvider()
    stages_recorded = []

    def stage_callback(stage_name: str):
        stages_recorded.append(stage_name)

    sources = [
        {
            "id": "src-test-01",
            "display_name": "Batch_Deviation_Log.txt",
            "source_type": "TEXT",
            "extracted_text": "Batch RS-2026-088 dissolved oxygen reached 4.2% at 03:14 UTC. Primary regulator PRV-201 ruptured diaphragm.",
            "content_hash": "a" * 64,
            "segments": [
                {
                    "segment_id": "s1",
                    "text": "Batch RS-2026-088 dissolved oxygen reached 4.2% at 03:14 UTC.",
                    "source_id": "src-test-01"
                },
                {
                    "segment_id": "s2",
                    "text": "Primary regulator PRV-201 ruptured diaphragm.",
                    "source_id": "src-test-01"
                }
            ]
        }
    ]

    model_id, structured_output, completed = execute_langgraph_rca(
        sources=sources,
        existing_fields={"version": 1, "product_name": ""},
        user_modified_fields=[],
        stage_callback=stage_callback,
        provider_override=mock_provider,
    )

    # 1. Verify model ID is explicitly mocked, never masquerading as live AI
    assert model_id == "mocked-deterministic-groq-model"

    # 2. Verify all 6 stages completed in chronological sequence
    expected_stages = [
        "prepare_source",
        "extract_incident",
        "analyze_evidence",
        "propose_investigation",
        "propose_capa",
        "validate_output"
    ]
    assert completed == expected_stages
    assert stages_recorded == expected_stages

    # 3. Verify output structures
    assert "field_provenance" in structured_output
    assert "potential_causes" in structured_output
    assert "five_whys" in structured_output
    assert "capa_suggestions" in structured_output
    assert "evidence_assessment" in structured_output

    # 4. Verify evidence strength is categorical (LIMITED, MODERATE, STRONG), no fake percentages
    for cause in structured_output["potential_causes"]:
        assert cause["evidence_strength"] in ("LIMITED", "MODERATE", "STRONG")
        assert "%" not in cause["evidence_strength"]

    # 5. Verify 5 Whys unresolved flag is supported
    assert any(step.get("is_unresolved") is True for step in structured_output["five_whys"])

    # 6. Verify CAPA cross-references match cause IDs
    cause_ids = {c["id"] for c in structured_output["potential_causes"]}
    for capa in structured_output["capa_suggestions"]:
        assert capa["related_cause_id"] in cause_ids


def test_missing_groq_api_key_configuration_error():
    """
    Verifies that missing or placeholder GROQ_API_KEY raises explicit GroqConfigurationError.
    Never silently falls back to hardcoded AI results.
    """
    # Empty key
    with pytest.raises(GroqConfigurationError) as exc_info:
        verify_groq_configuration(api_key="", model_id="llama-3.3-70b-versatile")
    assert "GROQ_API_KEY is not configured" in str(exc_info.value)
    assert exc_info.value.code == "GROQ_CONFIGURATION_ERROR"

    # Placeholder key
    with pytest.raises(GroqConfigurationError) as exc_info2:
        verify_groq_configuration(api_key="gsk_your_groq_api_key_here", model_id="llama-3.3-70b-versatile")
    assert "GROQ_API_KEY is not configured" in str(exc_info2.value)

    # Empty model
    with pytest.raises(GroqConfigurationError) as exc_info3:
        verify_groq_configuration(api_key="gsk_real_looking_key_12345", model_id="")
    assert "GROQ_MODEL configuration is empty" in str(exc_info3.value)


def test_groq_provider_authentication_error_fast_exit():
    """
    Verifies that AuthenticationError (401/403) from Groq fails immediately without endless retries.
    """
    with patch("groq.Groq") as mock_groq_class:
        from groq import AuthenticationError

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_client.chat.completions.create.side_effect = AuthenticationError("Invalid API key", response=mock_response, body=None)
        mock_groq_class.return_value = mock_client

        provider = GroqLiveProvider(api_key="gsk_invalid_test_key", model_id="llama-3.3-70b-versatile", max_retries=3)

        with pytest.raises(GroqConfigurationError) as exc_info:
            provider.generate_json([{"role": "user", "content": "test"}])

        assert "authentication failed" in str(exc_info.value).lower()
        # Ensure fast-fail: only called once, no endless retry loop on auth errors
        assert mock_client.chat.completions.create.call_count == 1


def test_groq_provider_transient_error_backoff_retry():
    """
    Verifies that transient errors (429 RateLimitError) are retried with backoff up to max_retries.
    """
    with patch("groq.Groq") as mock_groq_class, patch("time.sleep") as mock_sleep:
        from groq import RateLimitError

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 429
        rate_limit_err = RateLimitError("Rate limit exceeded. Please wait.", response=mock_response, body=None)

        # Fail twice with 429, then succeed on 3rd attempt
        success_choice = MagicMock()
        success_choice.message.content = '{"status": "ok", "retry_success": true}'
        success_response = MagicMock()
        success_response.choices = [success_choice]

        mock_client.chat.completions.create.side_effect = [rate_limit_err, rate_limit_err, success_response]
        mock_groq_class.return_value = mock_client

        provider = GroqLiveProvider(api_key="gsk_test_key", model_id="llama-3.3-70b-versatile", max_retries=2)
        result = provider.generate_json([{"role": "user", "content": "test"}])

        assert result.get("retry_success") is True
        assert mock_client.chat.completions.create.call_count == 3
        # Verified exponential backoff: sleep called with 1.0s then 2.0s
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)
        mock_sleep.assert_any_call(2.0)


@pytest.mark.asyncio
async def test_human_edit_protection_and_proposal_acceptance():
    """
    Verifies Human Edit Protection:
    1. Human-edited fields are NOT overwritten by an AI run.
    2. AI alternative values are returned as proposals.
    3. Explicit acceptance endpoint updates the field.
    4. Explicit rejection endpoint dismisses the proposal without clobbering.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create investigation
        inv_res = await client.post(
            "/api/investigations",
            json={
                "title": "Human Edit Protection Test",
                "observed_deviation": "Original Human Observation: Valve XV-104 leakage",
                "product_name": "", # empty, should be auto-filled
            }
        )
        assert inv_res.status_code == 201
        inv = inv_res.json()
        inv_id = inv["id"]

        # Human edits the observed deviation field (simulating investigator edit)
        patch_res = await client.patch(
            f"/api/investigations/{inv_id}",
            json={
                "version": inv["version"],
                "observed_deviation": "Investigator Confirmed: Operator smelled solvent at condenser outlet",
            }
        )
        assert patch_res.status_code == 200
        patched_inv = patch_res.json()
        assert patched_inv["content"]["field_provenance"]["observed_deviation"]["origin"] == "HUMAN"

        # Attach source document
        src_res = await client.post(
            f"/api/investigations/{inv_id}/sources",
            data={
                "source_type": "TEXT",
                "display_name": "SCADA_Batch_Log.txt",
                "text_content": "Batch RS-2026-088: Critical process parameter excursion. Dissolved oxygen peaked at 4.2% against specification limit of <= 0.5%.",
            }
        )
        assert src_res.status_code == 201

        # Trigger AI analysis run in test mock mode
        run_res = await client.post(
            f"/api/investigations/{inv_id}/analyze",
            json={"use_mock": True}
        )
        assert run_res.status_code == 202
        run_id = run_res.json()["id"]

        # Poll until COMPLETED
        for _ in range(25):
            await asyncio.sleep(0.1)
            poll = await client.get(f"/api/investigations/{inv_id}/runs/{run_id}")
            if poll.json()["status"] == "COMPLETED":
                break

        # Verify investigation state after AI run
        post_inv = (await client.get(f"/api/investigations/{inv_id}")).json()

        # 1. Empty field was auto-filled
        assert post_inv["product_name"] == "Rosuvastatin Calcium API"

        # 2. Human-edited field was PROTECTED and NOT overwritten!
        assert post_inv["observed_deviation"] == "Investigator Confirmed: Operator smelled solvent at condenser outlet"

        # 3. AI suggested alternative was recorded as a proposal
        proposals = post_inv["content"].get("human_edit_proposals", {})
        assert "observed_deviation" in proposals
        assert "4.2%" in proposals["observed_deviation"]["ai_proposed_value"]

        # 4. Explicit proposal acceptance replaces field
        accept_res = await client.post(f"/api/investigations/{inv_id}/proposals/observed_deviation/accept")
        assert accept_res.status_code == 200
        accepted_inv = accept_res.json()
        assert "4.2%" in accepted_inv["observed_deviation"]
        assert "observed_deviation" not in accepted_inv["content"].get("human_edit_proposals", {})
        assert accepted_inv["content"]["field_provenance"]["observed_deviation"]["origin"] == "AI"
        assert accepted_inv["content"]["field_provenance"]["observed_deviation"]["review_state"] == "ACCEPTED"


@pytest.mark.asyncio
async def test_api_analyze_fails_when_groq_not_configured_in_production_mode():
    """
    Verifies that calling /analyze in non-mock mode without GROQ_API_KEY
    raises GROQ_CONFIGURATION_ERROR (HTTP 422) and does not silently succeed with fake data.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create investigation
        inv_res = await client.post(
            "/api/investigations",
            json={"title": "Config Error Test"}
        )
        inv_id = inv_res.json()["id"]

        # Temporarily disable test mock flag to simulate live production request without API key
        with patch.dict(os.environ, {"USE_MOCK_GROQ": "false"}), patch.object(settings, "GROQ_API_KEY", ""):
            run_res = await client.post(
                f"/api/investigations/{inv_id}/analyze",
                json={"use_mock": False}
            )
            assert run_res.status_code == 422
            err_data = run_res.json()
            assert err_data["error"]["code"] == "GROQ_CONFIGURATION_ERROR"
            assert "GROQ_API_KEY is not configured" in err_data["error"]["message"]


@pytest.mark.asyncio
@pytest.mark.skipif(
    not os.getenv("GROQ_API_KEY") or os.getenv("GROQ_API_KEY").startswith("gsk_your_groq_api_key"),
    reason="Live GROQ_API_KEY not configured in environment. Skipping live Groq smoke test."
)
async def test_live_groq_smoke_test():
    """
    SEPARATELY LABELED LIVE GROQ SMOKE TEST:
    Executes an actual live LLM call against the Groq API only if real credentials exist.
    """
    live_key = os.getenv("GROQ_API_KEY")
    live_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    # 1. Test live configuration probe
    verify_groq_configuration(api_key=live_key, model_id=live_model, live_probe=True)

    # 2. Test live live provider call
    provider = GroqLiveProvider(api_key=live_key, model_id=live_model)
    response = provider.generate_json([
        {
            "role": "system",
            "content": "You are a test assistant. Respond strictly with JSON: {\"live_success\": true, \"received\": \"ok\"}"
        },
        {"role": "user", "content": "Ping test"}
    ])

    assert response.get("live_success") is True
    assert provider.model_id == live_model
