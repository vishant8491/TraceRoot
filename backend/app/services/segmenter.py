import hashlib
import re
from typing import List, Dict, Any, Optional, Tuple


def compute_content_hash(text: str) -> str:
    """
    Computes a deterministic SHA-256 hash of the extracted or pasted text content.
    """
    cleaned = text.strip().encode("utf-8")
    return hashlib.sha256(cleaned).hexdigest()


def normalize_whitespace(text: str) -> str:
    """
    Documented Whitespace Normalization Protocol:
    1. Replaces all whitespace sequences (newlines, carriage returns, tabs, 
       multiple spaces, non-breaking spaces) with a single standard ASCII space (' ').
    2. Strips leading and trailing whitespace.
    
    Used consistently by both citation generation and citation quote verification.
    """
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def verify_citation_quote(quote: str, segment_text: str) -> bool:
    """
    Deterministic citation quote verification.
    Verifies that 'quote' is genuinely a substring of 'segment_text' under 
    standard whitespace normalization (case-insensitive).
    Returns True if quote is supported by segment, False if quote is hallucinated/fabricated.
    """
    if not quote or not segment_text:
        return False
    norm_quote = normalize_whitespace(quote).lower()
    norm_seg = normalize_whitespace(segment_text).lower()
    return norm_quote in norm_seg


def segment_pdf_pages(pages: List[Tuple[int, str]]) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Creates stable, addressable evidence segments for a multi-page PDF.
    Preserves exact page numbers (1-based) and paragraph segment IDs formatted as:
    'p{page_number}_s{paragraph_index}'.
    Also computes stable character offsets relative to the full concatenated text.
    """
    segments: List[Dict[str, Any]] = []
    full_text_parts: List[str] = []
    current_offset = 0

    for page_num, page_text in pages:
        cleaned_page = page_text.strip()
        if not cleaned_page:
            continue

        page_header = f"--- Page {page_num} ---\n"
        full_text_parts.append(page_header)
        current_offset += len(page_header)

        # Split paragraphs by double newline or significant line breaks
        raw_paragraphs = re.split(r"\n\s*\n", cleaned_page)
        seg_idx = 1

        for raw_para in raw_paragraphs:
            cleaned_para = raw_para.strip()
            if not cleaned_para:
                continue

            start_offset = current_offset
            end_offset = start_offset + len(cleaned_para)

            segments.append({
                "segment_id": f"p{page_num}_s{seg_idx}",
                "page_number": page_num,
                "paragraph_index": seg_idx - 1,
                "char_offset_start": start_offset,
                "char_offset_end": end_offset,
                "text": cleaned_para,
            })
            seg_idx += 1

            full_text_parts.append(cleaned_para)
            current_offset = end_offset

            # Add paragraph separation
            sep = "\n\n"
            full_text_parts.append(sep)
            current_offset += len(sep)

    full_text = "".join(full_text_parts).strip()
    return full_text, segments


def segment_text_content(text: str, prefix: str = "s") -> List[Dict[str, Any]]:
    """
    Splits text or email content into stable, addressable paragraph segments.
    Segment IDs are formatted as '{prefix}{index}', e.g. 's1', 's2', 's3'.
    Calculates exact char_offset_start and char_offset_end.
    """
    raw_paragraphs = re.split(r"\n\s*\n", text.strip())
    segments: List[Dict[str, Any]] = []
    seg_idx = 1
    last_pos = 0

    for para in raw_paragraphs:
        cleaned_para = para.strip()
        if not cleaned_para:
            continue

        # Locate paragraph in original text to preserve accurate offsets
        start_offset = text.find(cleaned_para, last_pos)
        if start_offset == -1:
            start_offset = last_pos
        end_offset = start_offset + len(cleaned_para)
        last_pos = end_offset

        segments.append({
            "segment_id": f"{prefix}{seg_idx}",
            "page_number": None,
            "paragraph_index": seg_idx - 1,
            "char_offset_start": start_offset,
            "char_offset_end": end_offset,
            "text": cleaned_para,
        })
        seg_idx += 1

    if not segments and text.strip():
        cleaned_all = text.strip()
        segments.append({
            "segment_id": f"{prefix}1",
            "page_number": None,
            "paragraph_index": 0,
            "char_offset_start": 0,
            "char_offset_end": len(cleaned_all),
            "text": cleaned_all,
        })

    return segments


def parse_and_format_email(
    raw_text: str,
    subject: Optional[str] = None,
    from_addr: Optional[str] = None,
    date_str: Optional[str] = None,
    to_addr: Optional[str] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Parses and standardizes pasted email records into a uniform downstream structure.
    If headers are supplied in form fields or embedded in text lines (From:, Subject:, Date:, To:),
    they are parsed and formatted into a header segment ('s1') followed by body segments ('s2', 's3'...).
    """
    extracted_from = from_addr or ""
    extracted_to = to_addr or ""
    extracted_subject = subject or ""
    extracted_date = date_str or ""
    body_lines: List[str] = []

    # Check if raw_text contains inline headers
    lines = raw_text.splitlines()
    in_header = True

    for line in lines:
        stripped = line.strip()
        if in_header:
            if not stripped:
                in_header = False
                continue
            lower_line = stripped.lower()
            if lower_line.startswith("from:") and not extracted_from:
                extracted_from = stripped[5:].strip()
                continue
            elif lower_line.startswith("to:") and not extracted_to:
                extracted_to = stripped[3:].strip()
                continue
            elif lower_line.startswith("date:") and not extracted_date:
                extracted_date = stripped[5:].strip()
                continue
            elif lower_line.startswith("subject:") and not extracted_subject:
                extracted_subject = stripped[8:].strip()
                continue
        # Body line
        body_lines.append(line)

    body_text = "\n".join(body_lines).strip()
    if not body_text:
        body_text = raw_text.strip()

    header_block = (
        f"--- EMAIL HEADER ---\n"
        f"From: {extracted_from or 'Unspecified Sender'}\n"
        f"To: {extracted_to or 'Unspecified Recipient'}\n"
        f"Date: {extracted_date or 'Unspecified Date'}\n"
        f"Subject: {extracted_subject or 'Pasted Email Record'}\n"
        f"--- EMAIL BODY ---"
    )

    full_email_text = f"{header_block}\n\n{body_text}"

    # Build segments: s1 is header block, s2..sN are body paragraphs
    segments: List[Dict[str, Any]] = []
    header_len = len(header_block)

    segments.append({
        "segment_id": "s1",
        "page_number": None,
        "paragraph_index": 0,
        "char_offset_start": 0,
        "char_offset_end": header_len,
        "text": header_block,
    })

    # Segment body
    body_segments = segment_text_content(body_text, prefix="s")
    for b_seg in body_segments:
        seg_num = int(b_seg["segment_id"][1:]) + 1
        b_seg["segment_id"] = f"s{seg_num}"
        b_seg["paragraph_index"] = seg_num - 1
        b_seg["char_offset_start"] += header_len + 2
        b_seg["char_offset_end"] += header_len + 2
        segments.append(b_seg)

    return full_email_text, segments


def sanitize_for_prompt_injection(text: str) -> str:
    """
    Neutralizes prompt injection directives and wraps untrusted source text safely.
    Replaces common system prompt injection triggers so that text cannot override
    the AI investigation instructions.
    """
    if not text:
        return ""
    # Disarm common prompt override patterns
    sanitized = text
    patterns = [
        (r"(?i)ignore\s+(all\s+)?(previous|prior)\s+instructions.*", "[UNTRUSTED_INSTRUCTION_NEUTRALIZED]"),
        (r"(?i)\[\s*system\s+override\s*\]", "[UNTRUSTED_INSTRUCTION_NEUTRALIZED]"),
        (r"(?i)system\s*:\s*", "System [claim]: "),
        (r"(?i)human\s*:\s*", "Human [claim]: "),
        (r"(?i)assistant\s*:\s*", "Assistant [claim]: "),
        (r"(?i)<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>", "[DISARMED SCRIPT TAG]"),
    ]
    for pattern, replacement in patterns:
        sanitized = re.sub(pattern, replacement, sanitized)
    return sanitized


# Compatibility alias
segment_text = segment_text_content

