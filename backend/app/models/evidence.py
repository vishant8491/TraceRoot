import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class EvidenceItem(Base):
    """
    Evidence piece associated with the investigation.
    Tracks raw source text, extracted data, supporting vs contradictory points.
    """
    __tablename__ = "evidence_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(50), default="PASTED_TEXT", nullable=False) # PASTED_TEXT, UPLOADED_PDF, EMAIL
    title: Mapped[str] = mapped_column(String(255), default="Evidence Record", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    supporting_points: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list, nullable=True)
    contradictory_points: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    investigation: Mapped["Investigation"] = relationship("Investigation", back_populates="evidence_items")
