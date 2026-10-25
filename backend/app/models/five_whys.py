import uuid
from typing import Optional
from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class FiveWhysStep(Base):
    """
    Structured step within the 5 Whys deductive reasoning tree.
    Tracks progression from symptoms to systemic root causes.
    """
    __tablename__ = "five_whys_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="PHYSICAL", nullable=False) # PHYSICAL, HUMAN, SYSTEMIC
    evidence_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    investigation: Mapped["Investigation"] = relationship("Investigation", back_populates="five_whys_steps")
