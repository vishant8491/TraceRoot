from enum import Enum


class InvestigationStatus(str, Enum):
    DRAFT = "DRAFT"
    UNDER_REVIEW = "UNDER_REVIEW"
    CAPA_APPROVED = "CAPA_APPROVED"
    CLOSED = "CLOSED"


class EvidenceSourceType(str, Enum):
    PASTED_TEXT = "PASTED_TEXT"
    UPLOADED_PDF = "UPLOADED_PDF"
    EMAIL = "EMAIL"


class FiveWhysCategory(str, Enum):
    PHYSICAL = "PHYSICAL"
    HUMAN = "HUMAN"
    SYSTEMIC = "SYSTEMIC"


class IshikawaCategory(str, Enum):
    MACHINE = "Machine"
    MATERIAL = "Material"
    METHOD = "Method"
    MEASUREMENT = "Measurement"
    MAN = "Man"
    ENVIRONMENT = "Environment"


class CapaType(str, Enum):
    CONTAINMENT = "CONTAINMENT"
    CORRECTIVE = "CORRECTIVE"
    PREVENTIVE = "PREVENTIVE"


class CapaStatus(str, Enum):
    PROPOSED = "PROPOSED"
    IMPLEMENTED = "IMPLEMENTED"
    VERIFIED = "VERIFIED"


class ImpactLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
