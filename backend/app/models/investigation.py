import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy import String, Text, Integer, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_investigation_content() -> Dict[str, Any]:
    """
    Default structure for typed nested investigation content.
    Contains field provenance, 5 Whys chain, potential causes, contributing factors,
    evidence gaps, CAPA suggestions, and human review records.
    """
    return {
        "field_provenance": {},
        "five_whys": [],
        "potential_causes": [],
        "contributing_factors": [],
        "evidence_gaps": [],
        "capa_suggestions": [],
        "human_review_decisions": {},
    }


class Investigation(Base):
    """
    Core RCA Investigation entity for Active Pharmaceutical Ingredient deviations.
    Enforces optimistic concurrency via version incrementing and atomic draft reviews.
    """
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    investigation_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False)  # DRAFT or REVIEWED

    # Manufacturing context
    product_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    batch_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    manufacturing_stage: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    incident_date: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    site_department: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    equipment: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    # Core non-conformance boundaries (differentiating empirical observation from hypotheses)
    observed_deviation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expected_condition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actual_condition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    immediate_containment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Personnel and review metadata
    investigator_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    reviewer_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Optimistic concurrency version
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Typed nested analysis content (JSON / JSONB)
    content: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        default=default_investigation_content,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    # Relational child collections
    source_documents: Mapped[List["SourceDocument"]] = relationship(
        "SourceDocument",
        back_populates="investigation",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    ai_runs: Mapped[List["AIRun"]] = relationship(
        "AIRun",
        back_populates="investigation",
        cascade="all, delete-orphan",
        order_by="AIRun.started_at.desc()",
        lazy="selectin",
    )
