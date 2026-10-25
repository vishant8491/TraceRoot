from typing import Any, Optional
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class TraceRootException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Any] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class NotFoundError(TraceRootException):
    def __init__(self, resource: str, identifier: str):
        super().__init__(
            code="NOT_FOUND",
            message=f"{resource} '{identifier}' was not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )


class ConcurrencyConflictError(TraceRootException):
    def __init__(self, current_version: int, submitted_version: int):
        super().__init__(
            code="CONCURRENCY_CONFLICT",
            message=(
                f"Optimistic concurrency conflict: the investigation has been modified. "
                f"Current server version is {current_version}, but update was submitted against version {submitted_version}."
            ),
            status_code=status.HTTP_409_CONFLICT,
            details={
                "current_version": current_version,
                "submitted_version": submitted_version,
            },
        )


class ConcurrentRunError(TraceRootException):
    def __init__(self, existing_run_id: str):
        super().__init__(
            code="CONCURRENT_RUN_IN_PROGRESS",
            message="An AI analysis run is already in progress for this investigation. Repeated concurrent runs are blocked.",
            status_code=status.HTTP_409_CONFLICT,
            details={"active_run_id": existing_run_id},
        )


class UnreviewedContentError(TraceRootException):
    def __init__(self, unreviewed_items: list):
        super().__init__(
            code="UNREVIEWED_CONTENT_REMAINING",
            message=(
                "All AI-populated content must be explicitly reviewed (accepted, edited, or rejected) "
                "before an investigation can be marked as REVIEWED. Note: REVIEWED indicates user review of a draft, "
                "not qualified regulatory approval or confirmed scientific causality."
            ),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"unreviewed_items": unreviewed_items},
        )


class InvalidStateTransitionError(TraceRootException):
    def __init__(self, message: str):
        super().__init__(
            code="INVALID_STATE_TRANSITION",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class GroqConfigurationError(TraceRootException):
    def __init__(
        self,
        message: str = "GROQ_API_KEY is not configured or configured model is unavailable on the server. Please set GROQ_API_KEY in backend/.env."
    ):
        super().__init__(
            code="GROQ_CONFIGURATION_ERROR",
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class GroqExecutionError(TraceRootException):
    def __init__(self, message: str, failure_code: str = "GROQ_EXECUTION_ERROR"):
        super().__init__(
            code=failure_code,
            message=message,
            status_code=status.HTTP_502_BAD_GATEWAY,
        )


# --- Source Intake & PDF Exceptions ---

class PDFSignatureError(TraceRootException):
    def __init__(self, message: str = "Invalid file signature: uploaded file does not start with a valid PDF header (%PDF-)."):
        super().__init__(
            code="PDF_INVALID_SIGNATURE",
            message=message,
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class PDFTooLargeError(TraceRootException):
    def __init__(self, size_bytes: int, max_bytes: int):
        size_mb = size_bytes / (1024 * 1024)
        max_mb = max_bytes / (1024 * 1024)
        super().__init__(
            code="PDF_FILE_TOO_LARGE",
            message=f"Uploaded PDF exceeds the maximum supported size of {max_mb:.0f} MB ({size_mb:.2f} MB provided). Please provide a smaller source file.",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"file_size_bytes": size_bytes, "max_size_bytes": max_bytes},
        )


class PDFCorruptError(TraceRootException):
    def __init__(self, details: Optional[str] = None):
        super().__init__(
            code="PDF_CORRUPT_OR_DAMAGED",
            message="The PDF file is damaged, corrupted, or not compliant with the PDF standard and cannot be parsed.",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"parser_error": details} if details else None,
        )


class PDFPasswordProtectedError(TraceRootException):
    def __init__(self):
        super().__init__(
            code="PDF_PASSWORD_PROTECTED",
            message="The uploaded PDF is encrypted or password-protected. Please provide an unencrypted PDF for investigation intake.",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class PDFPageLimitExceededError(TraceRootException):
    def __init__(self, pages: int, max_pages: int):
        super().__init__(
            code="PDF_PAGE_LIMIT_EXCEEDED",
            message=f"PDF exceeds the maximum limit of {max_pages} pages ({pages} pages detected). Do not submit entire batch binder archives; please extract and upload only the relevant deviation report sections.",
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"page_count": pages, "max_pages": max_pages},
        )


class PDFScannedImageOnlyError(TraceRootException):
    def __init__(self):
        super().__init__(
            code="PDF_SCANNED_IMAGE_ONLY",
            message=(
                "The uploaded PDF appears to be a scanned or image-only document with no selectable text layer. "
                "TraceRoot requires machine-readable selectable text. OCR is not configured. "
                "Please upload a PDF generated from an electronic record or copy and paste the incident text directly."
            ),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class PDFCharacterLimitExceededError(TraceRootException):
    def __init__(self, char_count: int, max_chars: int):
        super().__init__(
            code="PDF_CHARACTER_LIMIT_EXCEEDED",
            message=(
                f"Extracted document text exceeds the maximum limit of {max_chars:,} characters ({char_count:,} characters extracted). "
                f"To maintain investigation rigor without silent truncation, please upload only the specific deviation sections or incident pages."
            ),
            status_code=status.HTTP_400_BAD_REQUEST,
            details={"character_count": char_count, "max_characters": max_chars},
        )


class CitationVerificationError(TraceRootException):
    def __init__(self, quote: str, segment_id: str):
        super().__init__(
            code="CITATION_VERIFICATION_FAILED",
            message=f"Citation quote could not be verified in referenced segment '{segment_id}' under whitespace normalization.",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"quote": quote, "segment_id": segment_id},
        )


async def traceroot_exception_handler(request: Request, exc: TraceRootException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        field_path = ".".join(str(loc) for loc in err.get("loc", []))
        errors.append({
            "field": field_path,
            "message": err.get("msg", "Invalid input value"),
            "type": err.get("type", "value_error"),
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Input validation failed. Please check the submitted fields.",
                "details": errors,
            }
        },
    )


async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"500 Internal Error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": f"An unexpected error occurred while processing the investigation request: {str(exc)[:250]}",
                "details": str(exc),
            }
        },
    )
