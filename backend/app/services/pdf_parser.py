import io
import os
import re
import hashlib
import logging
from typing import List, Tuple, Optional
from dataclasses import dataclass
from contextlib import contextmanager
import tempfile

from app.exceptions import (
    PDFSignatureError,
    PDFTooLargeError,
    PDFCorruptError,
    PDFPasswordProtectedError,
    PDFPageLimitExceededError,
    PDFScannedImageOnlyError,
    PDFCharacterLimitExceededError,
)

logger = logging.getLogger(__name__)

# Documented finite operational limits
MAX_PDF_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB maximum upload size
MAX_PDF_PAGES: int = 50                      # 50 pages maximum (prevents huge binder uploads)
MAX_EXTRACTED_CHARACTERS: int = 150_000      # 150,000 characters maximum (~30,000 words)
MAX_PDF_CHARACTERS: int = MAX_EXTRACTED_CHARACTERS
MAX_MODEL_TOKEN_BUDGET: int = 32_000         # 32,000 token budget for model context safety


@dataclass
class ParsedPDF:
    """Structured result of deterministic PDF validation and extraction."""
    display_name: str
    extracted_text: str
    pages: List[Tuple[int, str]]  # (page_number 1-based, page_text)
    page_count: int
    total_characters: int
    content_hash: str


def sanitize_filename(filename: Optional[str]) -> str:
    """
    Sanitizes untrusted filenames:
    - Strips directory paths and traversal attempts (e.g. '../', '..\\')
    - Removes null bytes and control characters
    - Constrains to alphanumeric, hyphen, underscore, and dot
    - Enforces .pdf extension
    """
    if not filename:
        return "evidence_document.pdf"

    # Strip directory components (both Windows and POSIX separators)
    clean = os.path.basename(filename.replace("\\", "/"))
    # Remove null bytes and control characters
    clean = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", clean)
    # Replace dangerous or reserved characters
    clean = re.sub(r"[^a-zA-Z0-9_.-]", "_", clean)
    # Strip leading/trailing dots or underscores
    clean = clean.strip("._")
    if not clean:
        clean = "evidence_document"
    if not clean.lower().endswith(".pdf"):
        clean = f"{clean}.pdf"
    return clean[:120]


@contextmanager
def safe_temp_pdf_file(pdf_bytes: bytes):
    """
    Context manager that writes PDF bytes to a secure temporary file and
    guarantees immediate file cleanup upon exiting the block.
    """
    temp_file = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    try:
        temp_file.write(pdf_bytes)
        temp_file.flush()
        temp_file.close()
        yield temp_file.name
    finally:
        if os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
            except Exception as e:
                logger.warning(f"Failed to remove temporary PDF file {temp_file.name}: {e}")


def parse_and_validate_pdf(
    pdf_bytes: bytes,
    filename: Optional[str] = None,
    original_filename: Optional[str] = None,
) -> ParsedPDF:
    """
    Validates and extracts machine-readable text from a PDF document.
    Enforces all operational limits and handles corrupted, encrypted,
    and image-only/scanned files explicitly without silent truncation.
    """
    target_name = original_filename or filename
    clean_name = sanitize_filename(target_name)

    # 1. Size Validation
    byte_length = len(pdf_bytes)
    if byte_length == 0:
        raise PDFCorruptError("Uploaded PDF file is completely empty (0 bytes).")
    if byte_length > MAX_PDF_SIZE_BYTES:
        raise PDFTooLargeError(byte_length, MAX_PDF_SIZE_BYTES)

    # 2. Magic File Signature Validation (%PDF-)
    # The PDF specification requires the header to start with %PDF- (typically within the first 1024 bytes)
    header_probe = pdf_bytes[:1024]
    if b"%PDF-" not in header_probe:
        raise PDFSignatureError(
            f"Invalid file signature for '{clean_name}'. File does not contain the mandatory PDF header (%PDF-). "
            f"Ensure the uploaded file is a valid PDF document and not another format renamed with a .pdf extension."
        )

    # 3. Parsing with pypdf
    try:
        from pypdf import PdfReader
        from pypdf.errors import PdfReadError
    except ImportError as e:
        logger.error(f"pypdf library missing: {e}")
        raise RuntimeError("pypdf extraction library is not available on server.")

    stream = io.BytesIO(pdf_bytes)
    try:
        reader = PdfReader(stream, strict=False)
    except Exception as e:
        logger.warning(f"Failed to initialize PdfReader for {clean_name}: {e}")
        raise PDFCorruptError(str(e))

    # 4. Password Protection / Encryption Check
    if reader.is_encrypted:
        try:
            # Check if it has an empty password default
            decrypt_res = reader.decrypt("")
            if decrypt_res == 0:
                raise PDFPasswordProtectedError()
        except Exception:
            raise PDFPasswordProtectedError()

    # 5. Page Count Validation
    try:
        page_count = len(reader.pages)
    except Exception as e:
        raise PDFCorruptError(f"Could not read PDF page catalog: {e}")

    if page_count == 0:
        raise PDFCorruptError("PDF document contains 0 pages.")
    if page_count > MAX_PDF_PAGES:
        raise PDFPageLimitExceededError(page_count, MAX_PDF_PAGES)

    # 6. Page-by-Page Text Extraction
    pages: List[Tuple[int, str]] = []
    total_chars = 0
    full_text_blocks = []

    for idx, page in enumerate(reader.pages):
        page_num = idx + 1
        try:
            raw_page_text = page.extract_text() or ""
        except Exception as e:
            logger.warning(f"Warning extracting text from page {page_num} of {clean_name}: {e}")
            raw_page_text = ""

        cleaned_page = raw_page_text.strip()
        pages.append((page_num, cleaned_page))
        total_chars += len(cleaned_page)
        if cleaned_page:
            full_text_blocks.append(f"--- Page {page_num} ---\n{cleaned_page}")

    # 7. Scanned / Image-Only PDF Detection
    # If the entire PDF yielded 0 extractable characters across all pages, it lacks a text layer.
    if total_chars == 0:
        raise PDFScannedImageOnlyError()

    # 8. Extracted Character Limit (Prevent memory exhaustion without silent truncation)
    if total_chars > MAX_EXTRACTED_CHARACTERS:
        raise PDFCharacterLimitExceededError(total_chars, MAX_EXTRACTED_CHARACTERS)

    combined_text = "\n\n".join(full_text_blocks).strip()
    content_hash = hashlib.sha256(combined_text.encode("utf-8")).hexdigest()

    return ParsedPDF(
        display_name=clean_name,
        extracted_text=combined_text,
        pages=pages,
        page_count=page_count,
        total_characters=total_chars,
        content_hash=content_hash,
    )


def extract_text_from_pdf_bytes(pdf_bytes: bytes, filename: Optional[str] = None) -> str:
    """
    Backward-compatible helper that validates and returns the full extracted text.
    """
    result = parse_and_validate_pdf(pdf_bytes, filename)
    return result.extracted_text
