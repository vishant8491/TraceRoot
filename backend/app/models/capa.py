import uuid
from typing import Optional
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class CapaItem(Base):
    """
    ICH Q10-aligned Corrective & Preventive Action item.
    Enforces clean separation between Containment, Corrective, and Preventive Actions,
    and requires an explicit Effectiveness Check plan.
    """
    __tablename__ = "capa_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)
    capa_type: Mapped[str] = mapped_column(String(50), nullable=False) # CONTAINMENT, CORRECTIVE, PREVENTIVE
    action_description: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    target_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    effectiveness_criteria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="PROPOSED", nullable=False) # PROPOSED, IMPLEMENTED, VERIFIED

    investigation: Mapped["Investigation"] = relationship("Investigation", back_populates="capa_items")


class MissingEvidenceItem(Base):
    """
    Represents an evidence gap or unanswered question flagged during investigation.
    Highlights uncertainty or missing records (e.g. calibration logs, raw chromatograms).
    """
    __tablename__ = "missing_evidence_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)
    missing_item: Mapped[str] = mapped_column(String(255), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    impact_level: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False) # HIGH, MEDIUM, LOW
    recommended_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    investigation: Mapped["Investigation"] = relationship("Investigation", back_populates="missing_evidence_items")
