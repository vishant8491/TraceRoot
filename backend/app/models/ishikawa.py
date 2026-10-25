import uuid
from typing import Optional
from sqlalchemy import String, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class IshikawaFactor(Base):
    """
    Fishbone (6M) analysis factor: Man, Machine, Material, Method, Measurement, Environment.
    Tracks whether a factor is verified as contributing to the deviation.
    """
    __tablename__ = "ishikawa_factors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    investigation_id: Mapped[str] = mapped_column(String(36), ForeignKey("investigations.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False) # Machine, Material, Method, Measurement, Man, Environment
    factor: Mapped[str] = mapped_column(String(255), nullable=False)
    is_contributing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    investigation: Mapped["Investigation"] = relationship("Investigation", back_populates="ishikawa_factors")
