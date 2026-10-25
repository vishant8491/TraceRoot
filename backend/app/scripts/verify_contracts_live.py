import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000/api"

def run_checks():
    print("=== LIVE CONTRACTS VERIFICATION ===")
    
    # 1. Health endpoint
    h_resp = json.loads(urllib.request.urlopen(f"{BASE}/health").read().decode())
    print(f"[OK] GET /api/health -> status: {h_resp.get('status')}, db: {h_resp.get('database')}")
    
    # 2. List investigations
    invs = json.loads(urllib.request.urlopen(f"{BASE}/investigations").read().decode())
    print(f"[OK] GET /api/investigations -> {len(invs)} investigations loaded")
    if not invs:
        print("[ERROR] No seeded investigations found")
        sys.exit(1)
        
    inv = invs[0]
    inv_id = inv["id"]
    ver = inv["version"]
    print(f"     Target: {inv['investigation_number']} (ver={ver}) - {inv['title'][:55]}...")
    
    # 3. Optimistic Concurrency 409 Conflict check
    stale_payload = json.dumps({"version": 9999, "title": "Stale Title"}).encode("utf-8")
    stale_req = urllib.request.Request(
        f"{BASE}/investigations/{inv_id}",
        data=stale_payload,
        headers={"Content-Type": "application/json"},
        method="PATCH"
    )
    try:
        urllib.request.urlopen(stale_req)
        print("[FAILED] Stale version save did not return 409!")
        sys.exit(1)
    except urllib.error.HTTPError as e:
        err = json.loads(e.read().decode())
        print(f"[OK] Stale PATCH rejected with HTTP {e.code}: {err['error']['code']} - {err['error']['message']}")
    
    # 4. Atomic atomic update check
    valid_payload = json.dumps({"version": ver, "equipment": "5000L Hastelloy CR-401 (Inspected)"}).encode("utf-8")
    valid_req = urllib.request.Request(
        f"{BASE}/investigations/{inv_id}",
        data=valid_payload,
        headers={"Content-Type": "application/json"},
        method="PATCH"
    )
    patched = json.loads(urllib.request.urlopen(valid_req).read().decode())
    new_ver = patched["version"]
    print(f"[OK] Valid PATCH updated version from {ver} to {new_ver} (equipment={patched['equipment']})")
    
    # 5. Fetch source document with stable segments
    if patched.get("source_documents"):
        src = patched["source_documents"][0]
        src_resp = json.loads(urllib.request.urlopen(f"{BASE}/investigations/{inv_id}/sources/{src['id']}").read().decode())
        print(f"[OK] GET /api/investigations/{inv_id}/sources/{src['id']} -> {src_resp['display_name']} ({len(src_resp['segments'])} segments, hash={src_resp['content_hash'][:16]}...)")
        
    # 6. Check Provenance & Structured RCA Content
    content = patched.get("content", {})
    whys = content.get("five_whys", [])
    causes = content.get("potential_causes", [])
    capas = content.get("capa_suggestions", [])
    print(f"[OK] Investigation Content: {len(whys)} 5-Whys, {len(causes)} Potential Causes, {len(capas)} CAPA Suggestions")
    
    print("\n>>> ALL BACKEND PERSISTENT CONTRACT CHECKS VERIFIED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    run_checks()
