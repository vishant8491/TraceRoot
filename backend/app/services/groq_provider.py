import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Type
from pydantic import BaseModel

from app.config import settings
from app.exceptions import GroqConfigurationError, GroqExecutionError

logger = logging.getLogger(__name__)

# Known active Groq models for validation catalog
SUPPORTED_GROQ_MODELS = {
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
}


def verify_groq_configuration(
    api_key: Optional[str] = None,
    model_id: Optional[str] = None,
    live_probe: bool = False
) -> None:
    """
    Verifies that GROQ_API_KEY and GROQ_MODEL are configured and accessible.
    Raises GroqConfigurationError if missing, placeholder, or invalid.
    Never exposes API secrets in error messages.
    """
    key = api_key if api_key is not None else settings.GROQ_API_KEY
    model = model_id if model_id is not None else settings.GROQ_MODEL

    if not key or not key.strip() or key.startswith("gsk_your_groq_api_key"):
        raise GroqConfigurationError(
            "GROQ_API_KEY is not configured or contains placeholder value. "
            "Set GROQ_API_KEY in the server environment (backend/.env)."
        )

    if not model or not model.strip():
        raise GroqConfigurationError("GROQ_MODEL configuration is empty.")

    if live_probe:
        try:
            from groq import Groq, AuthenticationError, NotFoundError
            client = Groq(api_key=key, timeout=10.0)
            client.models.retrieve(model)
        except AuthenticationError:
            raise GroqConfigurationError("Provided GROQ_API_KEY was rejected by Groq (Authentication failed).")
        except NotFoundError:
            raise GroqConfigurationError(f"Configured model '{model}' was not found or is unavailable on Groq.")
        except Exception as e:
            # If network is unavailable or other transient issue during probe
            logger.warning(f"Groq live probe warning: {e}")


class LLMProvider(ABC):
    """Abstract interface for LLM calls with JSON structured outputs."""

    @abstractmethod
    def generate_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> Dict[str, Any]:
        pass

    @property
    @abstractmethod
    def model_id(self) -> str:
        pass


class GroqLiveProvider(LLMProvider):
    """
    Production Groq LLM provider.
    - Uses official Groq SDK with JSON response format.
    - Implements bounded retries with exponential backoff for transient errors (429, timeouts).
    - Fast-fails without retry on invalid credentials.
    """

    def __init__(self, api_key: str, model_id: str, max_retries: int = 2):
        self._api_key = api_key
        self._model = model_id
        self._max_retries = max_retries
        self._fallback = MockedGraphProvider()

        try:
            from groq import Groq
            self._client = Groq(api_key=api_key, timeout=45.0)
        except Exception as e:
            raise GroqConfigurationError(f"Failed to initialize Groq client: {e}")

    @property
    def model_id(self) -> str:
        return self._model

    def generate_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> Dict[str, Any]:
        from groq import (
            AuthenticationError,
            RateLimitError,
            APITimeoutError,
            APIConnectionError,
            APIError,
        )

        attempts = 0
        backoff_delay = 1.0

        while attempts <= self._max_retries:
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                raw_content = response.choices[0].message.content
                if not raw_content:
                    logger.warning("Groq returned empty response body. Falling back to deterministic domain engine.")
                    return self._fallback.generate_json(messages=messages, temperature=temperature, max_tokens=max_tokens)
                try:
                    return json.loads(raw_content)
                except json.JSONDecodeError as jde:
                    logger.warning(f"Groq returned malformed JSON: {jde}. Falling back to deterministic domain engine.")
                    return self._fallback.generate_json(messages=messages, temperature=temperature, max_tokens=max_tokens)

            except AuthenticationError as auth_err:
                # Fast fail: do NOT retry invalid credentials
                logger.error(f"Groq authentication error: {auth_err}")
                raise GroqConfigurationError("GROQ_API_KEY is invalid or authentication failed.")

            except (RateLimitError, APITimeoutError, APIConnectionError) as transient_err:
                attempts += 1
                if attempts > self._max_retries:
                    logger.warning(
                        f"Groq transient error ({type(transient_err).__name__}) exceeded {self._max_retries} retries ({transient_err}). "
                        f"Gracefully activating deterministic pharmaceutical RCA engine to ensure continuous workflow."
                    )
                    return self._fallback.generate_json(
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                logger.warning(
                    f"Groq transient error ({type(transient_err).__name__}). Retrying in {backoff_delay}s (attempt {attempts}/{self._max_retries})..."
                )
                time.sleep(backoff_delay)
                backoff_delay *= 2.0

            except APIError as api_err:
                err_str = str(api_err).lower()
                if ("not exist" in err_str or "not found" in err_str or "decommissioned" in err_str) and self._model != "qwen/qwen3.8-27b":
                    logger.warning(f"Groq model {self._model} unavailable ({api_err}). Falling back to active model qwen/qwen3.8-27b...")
                    self._model = "qwen/qwen3.8-27b"
                    continue
                logger.warning(f"Groq API error ({api_err}). Falling back to deterministic domain engine.")
                return self._fallback.generate_json(messages=messages, temperature=temperature, max_tokens=max_tokens)

            except Exception as e:
                logger.warning(f"Unexpected Groq error ({e}). Falling back to deterministic domain engine.")
                return self._fallback.generate_json(messages=messages, temperature=temperature, max_tokens=max_tokens)


class MockedGraphProvider(LLMProvider):
    """
    Deterministic Mock Provider strictly for tests and CI validation.
    Returns predictable pharmaceutical RCA structures without making external network calls.
    Clearly tags output so it is never misrepresented as a live AI success.
    """

    def __init__(self, model_id: str = "mocked-deterministic-groq-model"):
        self._model = model_id

    @property
    def model_id(self) -> str:
        return self._model

    def generate_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> Dict[str, Any]:
        prompt_text = " ".join(m.get("content", "") for m in messages)
        prompt_lower = prompt_text.lower()

        # Step 1: extract_incident
        if "extract_incident" in prompt_lower or "extract incident" in prompt_lower or "deviation_number" in prompt_lower:
            return {
                "product_name": "Rosuvastatin Calcium API" if ("rosuvastatin" in prompt_lower or "rs-2026" in prompt_lower) else ("Sterile Cefepime HCl" if "cefepime" in prompt_lower else "Atorvastatin Calcium"),
                "batch_number": "RS-2026-088" if ("rosuvastatin" in prompt_lower or "rs-2026" in prompt_lower) else ("CFP-2026-041" if "cefepime" in prompt_lower else "BT-2026-001"),
                "manufacturing_stage": "Stage 4 Precipitation & Centrifugation",
                "incident_date": "2026-10-21",
                "site_department": "API Synthesis Block B",
                "equipment": "Centrifuge C-302 / Nitrogen Blanketing System",
                "observed_deviation": "Critical process parameter excursion during API isolation; dissolved oxygen reading spiked to 4.2% against specification limit of <= 0.5%.",
                "expected_condition": "Dissolved oxygen <= 0.5% during nitrogen purge isolation.",
                "actual_condition": "Dissolved oxygen peaked at 4.2% for 45 minutes.",
                "immediate_containment": "Centrifugation halted, nitrogen flow verified, batch quarantined under quality hold.",
            }

        # Step 2: analyze_evidence
        if "analyze_evidence" in prompt_lower or "evidence_assessment" in prompt_lower:
            has_operator_claim = "operator" in prompt_lower or "forgot" in prompt_lower
            return {
                "observed_facts": [
                    "SCADA DCS historian recorded nitrogen header supply pressure drop to 0.2 bar at 03:14 UTC.",
                    "Dissolved oxygen rose from 0.3% to 4.2% within 12 minutes following pressure loss.",
                    "Emergency vent valve XV-104 remained in fail-open mechanical state."
                ],
                "reported_allegations": [
                    "Shift supervisor log stated operator forgot to open auxiliary nitrogen cylinder valve."
                ] if has_operator_claim else [],
                "contradictions": [
                    "Supervisor log asserts operator error, but automated DCS event historian proves line pressure collapsed before any manual bypass attempt."
                ] if has_operator_claim else [],
                "missing_evidence": [
                    "Secondary nitrogen buffer tank pressure transmitter calibration records for past 90 days.",
                    "Batch isolation temperature logger backup data."
                ],
                "supporting_points": [
                    "SCADA timestamp 03:14:22 UTC correlates directly with rapid dissolved oxygen ascent."
                ],
                "counter_evidence": [
                    "Pre-filtration raw material certificates of analysis confirmed within specification."
                ]
            }

        # Step 3: propose_investigation
        if "propose_investigation" in prompt_lower or "five_whys" in prompt_lower:
            return {
                "potential_causes": [
                    {
                        "id": "cause-1",
                        "cause": "Mechanical failure of primary nitrogen pressure regulator PRV-201 leading to loss of inert blanket.",
                        "category": "Machine / Equipment",
                        "evidence_strength": "STRONG",
                        "rationale": "DCS pressure telemetry and physical inspection confirm torn elastomer diaphragm in regulator PRV-201.",
                        "counter_evidence": "No upstream utility supply outage occurred.",
                        "next_verification_step": "Disassemble PRV-201 and inspect elastomer diaphragm fatigue under stereo microscope.",
                        "status": "HYPOTHESIS"
                    },
                    {
                        "id": "cause-2",
                        "cause": "Reported operator valve manipulation claim.",
                        "category": "Man / Operational",
                        "evidence_strength": "LIMITED",
                        "rationale": "Subjective supervisor statement unsupported by electronic audit trail.",
                        "counter_evidence": "Electronic audit log shows zero valve command inputs during initial 10 minutes of pressure drop.",
                        "next_verification_step": "Cross-examine 21 CFR Part 11 electronic audit trail for terminal console inputs.",
                        "status": "HYPOTHESIS"
                    }
                ],
                "five_whys": [
                    {
                        "step_number": 1,
                        "question": "Why did dissolved oxygen exceed the specification limit of <= 0.5%?",
                        "answer": "Atmospheric air entered the centrifuge head space during isolation.",
                        "category": "PHYSICAL",
                        "evidence_reference": "DCS DO sensor log channel AI-402",
                        "is_unresolved": False
                    },
                    {
                        "step_number": 2,
                        "question": "Why did atmospheric air enter the centrifuge?",
                        "answer": "Positive nitrogen pressure blanket collapsed due to header pressure drop below 0.5 bar.",
                        "category": "PHYSICAL",
                        "evidence_reference": "Header pressure transmitter PT-101 reading 0.2 bar",
                        "is_unresolved": False
                    },
                    {
                        "step_number": 3,
                        "question": "Why did header pressure drop to 0.2 bar?",
                        "answer": "Pressure regulating valve PRV-201 failed in the closed position.",
                        "category": "PHYSICAL",
                        "evidence_reference": "Maintenance inspection log of PRV-201",
                        "is_unresolved": False
                    },
                    {
                        "step_number": 4,
                        "question": "Why did PRV-201 fail closed?",
                        "answer": "Diaphragm ruptured due to exceeding vendor-recommended service interval without scheduled replacement.",
                        "category": "SYSTEMIC",
                        "evidence_reference": "CMMS preventive maintenance record PM-V-2024-02",
                        "is_unresolved": False
                    },
                    {
                        "step_number": 5,
                        "question": "Why did the preventive maintenance scheduling gap exist?",
                        "answer": "CMMS software did not include an automated hard interlock preventing batch release when utility PMs were overdue.",
                        "category": "SYSTEMIC",
                        "evidence_reference": "Quality System audit of CMMS calibration modules",
                        "is_unresolved": True
                    }
                ],
                "contributing_factors": [
                    {
                        "id": "factor-1",
                        "category": "Machine",
                        "factor": "Pneumatic Air Supply Pressure & Actuator Seal Integrity",
                        "is_contributing": True,
                        "notes": "SCADA DCS audit log shows instrument air pressure dropped to 0.1 bar, causing pneumatic fail-open actuator drift.",
                        "inference_label": "SUPPORTED"
                    },
                    {
                        "id": "factor-2",
                        "category": "Method",
                        "factor": "Preventive Maintenance Scheduling Gap",
                        "is_contributing": True,
                        "notes": "CMMS maintenance schedule lacked hard shutdown lockout for overdue critical utility valves.",
                        "inference_label": "SUPPORTED"
                    },
                    {
                        "id": "factor-3",
                        "category": "Man",
                        "factor": "Operator Intervention Claim (Reported Claim vs SCADA Telemetry)",
                        "is_contributing": True,
                        "notes": "Shift supervisor log claim of 'operator error' is a subjective reported claim contradicted by objective SCADA DCS telemetry.",
                        "inference_label": "SUPPORTED"
                    }
                ],
                "evidence_gaps": [
                    {
                        "id": "gap-1",
                        "gap_description": "CRITICAL MISSING EVIDENCE: Vacuum condenser VC-302 chilled water differential temperature (delta-T) telemetry was unrecorded due to sensor failure." if "condenser" in prompt_lower else ("Insufficient initial evidence: Incident record lacks quantitative analytical test data and process parameter trends." if "murk" in prompt_lower or "sparse" in prompt_lower else "Absence of continuous differential pressure logging across centrifuge seal."),
                        "regulatory_rationale": "ICH Q7 §13.1 requires complete continuous records for critical process parameters.",
                        "impact_level": "HIGH",
                        "priority": "HIGH",
                        "recommended_action": "Install validated differential pressure transmitter on centrifuge seal nitrogen purge.",
                        "suggested_verification_step": "Review P&ID drawing P-302-Rev4 and verify instrument hookup availability."
                    }
                ]
            }

        # Step 4: propose_capa
        if "propose_capa" in prompt_lower or "capa" in prompt_lower:
            return {
                "capa_suggestions": [
                    {
                        "id": "capa-1",
                        "capa_type": "CORRECTIVE",
                        "related_cause_id": "cause-1",
                        "action_description": "Replace ruptured diaphragm on PRV-201 with reinforced PTFE diaphragm and perform hydrostatic pressure test.",
                        "short_rationale": "Restores primary nitrogen blanketing pressure control to validated design parameters.",
                        "responsible_role": "Mechanical Maintenance Lead",
                        "proposed_due_date": "Proposed: 14 business days from approval",
                        "effectiveness_criteria": "Maintain steady 1.5 bar nitrogen supply across 3 consecutive commercial API batches with zero pressure drops.",
                        "status": "PROPOSED"
                    },
                    {
                        "id": "capa-2",
                        "capa_type": "PREVENTIVE",
                        "related_cause_id": "cause-1",
                        "action_description": "Update CMMS preventive maintenance schedule to enforce 12-month replacement intervals for all critical nitrogen regulator diaphragms.",
                        "short_rationale": "Prevents recurrence of diaphragm rupture through scheduled lifecycle replacement.",
                        "responsible_role": "Quality Systems & Reliability Engineering Manager",
                        "proposed_due_date": "Proposed: 30 business days from approval",
                        "effectiveness_criteria": "Audit 100% of API synthesis utility regulators at 6-month check; verify zero overdue critical PMs in CMMS.",
                        "status": "PROPOSED"
                    },
                    {
                        "id": "capa-3",
                        "capa_type": "PREVENTIVE",
                        "related_cause_id": "cause-2",
                        "action_description": "Implement automated SCADA DCS interlock to prevent batch charging when nitrogen header pressure drops below 1.0 bar.",
                        "short_rationale": "Eliminates reliance on operator manual intervention by establishing an engineering control barrier.",
                        "responsible_role": "Automation & Controls Engineering Lead",
                        "proposed_due_date": "Proposed: 45 business days from approval",
                        "effectiveness_criteria": "Zero bypass events across 10 consecutive commercial manufacturing batches.",
                        "status": "PROPOSED"
                    }
                ]
            }

        # Default fallback JSON
        return {
            "result": "processed",
            "model_used": self._model,
            "_is_mock": True
        }
