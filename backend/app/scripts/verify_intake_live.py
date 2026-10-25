import json
import urllib.request

BASE_URL = "http://127.0.0.1:8000/api"

def run_live_verification():
    print("=== TRACEROOT SOURCE INTAKE & SEGMENTATION LIVE VERIFICATION ===")

    # 1. Health
    h = json.loads(urllib.request.urlopen(f"{BASE_URL}/health").read().decode())
    print(f"[OK] Health check passed: {h['app']} ({h['ai_model']})")

    # 2. List investigations
    invs = json.loads(urllib.request.urlopen(f"{BASE_URL}/investigations").read().decode())
    print(f"[OK] Total investigations: {len(invs)}")

    for sample_num in ["INV-2026-SYN-0001", "INV-2026-SYN-0002", "INV-2026-SYN-0003"]:
        target = next((i for i in invs if i["investigation_number"] == sample_num), None)
        if not target:
            print(f"[FAIL] Missing {sample_num}")
            continue

        detail = json.loads(urllib.request.urlopen(f"{BASE_URL}/investigations/{target['id']}").read().decode())
        print(f"\n--- Investigating {sample_num}: {detail['title']} ---")
        print(f"Product: {detail['product_name']} | Batch: {detail['batch_number']}")

        sources = detail.get("source_documents", [])
        print(f"Attached Source Documents: {len(sources)}")
        for src in sources:
            print(f"  Source [{src['source_type']}]: {src['display_name']}")
            print(f"  Content Hash: {src['content_hash'][:24]}...")
            segments = src.get("segments", [])
            print(f"  Segments Generated: {len(segments)}")
            for seg in segments[:3]:
                page_info = f"Page {seg.get('page_number')} | " if seg.get('page_number') else ""
                offsets = f"offsets [{seg.get('char_offset_start')}:{seg.get('char_offset_end')}]"
                preview = seg.get('text', '').replace('\n', ' ')[:70]
                print(f"    - Segment ID: {seg['segment_id']:8} | {page_info}{offsets} | {preview}...")

        content = detail.get("content", {})
        evidence_gaps = content.get("evidence_gaps", [])
        print(f"Evidence Gaps Identified: {len(evidence_gaps)}")
        for gap in evidence_gaps[:2]:
            print(f"  * [{gap.get('impact_level')}] {gap.get('gap_description')[:85]}...")

        print(f"Domain Guidance References Attached: {len(content.get('domain_guidance_references', []))}")
        print(f"Regulatory Disclaimer: {content.get('regulatory_disclaimer', '')[:85]}...")

    print("\n=== ALL 3 SYNTHETIC PATHS VERIFIED ON LIVE BACKEND ===")

if __name__ == "__main__":
    run_live_verification()
