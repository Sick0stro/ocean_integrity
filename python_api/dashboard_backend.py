import pandas as pd
import json, ast, math, os, re, time, random, requests
from difflib import SequenceMatcher
from datetime import datetime
from tqdm import tqdm

# ---------- User Map ----------
USER_MAP = {
    "0fcc4fc7-bd19-40ef-9bc5-35f124e363cf": "plasticdata",
    "452a75ba-c77c-4776-80b4-2f6dbba3c6a0": "shee",
    "00addb84-645e-466c-a782-bf77be665918": "erinkelly",
    "91657d8a-234d-4714-91e2-c57398fbbca0": "eringrover",
    "ab4c6a60-25a0-4e88-aaed-3f656e6d4171": "oidata",
    "f3115200-2cb9-483e-8651-946a2b5c1c87": "alishees",
    "c9c61043-ce21-4303-bb16-61f883f2f619": "dimemilkov"
}

# ---------- Gemini API Configuration ----------
GEMINI_API_KEY = "AIzaSyAg1UqA4Myemif1fpa_hXQk570rHfO3da8"
CITY_CACHE_FILE = "city_cache.json"
BATCH_SIZE = 50
BATCH_DELAY = 3  # fixed 3-second delay between batches

# ---------- Gemini City Extraction ----------
def gemini_batch_city_extraction(addresses, max_retries=5):
    """Call Gemini 2.5-Flash for up to 50 addresses with retry logic."""
    joined = "\n".join([f"{i+1}. {addr}" for i, addr in enumerate(addresses)])
    prompt = f"""
You are a precise location extraction model.
Extract only the city name from each address below.

Return valid JSON list like:
[{{"index":1,"city":"Indore"}},{{"index":2,"city":"Dubai"}}]

Addresses:
{joined}
"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    for attempt in range(1, max_retries + 1):
        try:
            r = requests.post(url, headers=headers, json=payload, timeout=90)
            r.raise_for_status()
            data = r.json()
            text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            match = re.search(r"\[.*\]", text, re.S)
            if match:
                return json.loads(match.group(0))
        except Exception as e:
            print(f"[Gemini Error] Attempt {attempt}/{max_retries}: {e}")
            if attempt < max_retries:
                sleep_time = min(20, 2 ** attempt + random.random() * 2)
                print(f"⏳ Retrying in {sleep_time:.1f}s...")
                time.sleep(sleep_time)
            else:
                print("❌ All retries failed for this batch.")
    return []

def extract_cities_with_gemini(addresses):
    """Batch through unique addresses, save progress to cache."""
    city_cache = json.load(open(CITY_CACHE_FILE)) if os.path.exists(CITY_CACHE_FILE) else {}
    new_addrs = [a for a in addresses if a not in city_cache and isinstance(a, str) and a.strip()]
    print(f"🌍 {len(new_addrs)} new addresses to process...")

    for i in tqdm(range(0, len(new_addrs), BATCH_SIZE), desc="Extracting Cities", ncols=100):
        batch = new_addrs[i:i+BATCH_SIZE]
        results = gemini_batch_city_extraction(batch)
        for item in results:
            try:
                addr = batch[item["index"] - 1]
                city = item.get("city", "").strip()
                if city:
                    city_cache[addr] = city
            except Exception:
                continue
        json.dump(city_cache, open(CITY_CACHE_FILE, "w"), indent=2)
        time.sleep(BATCH_DELAY)  # ✅ fixed 3s delay between every batch
    return city_cache

# ---------- Utility Functions ----------
def parse_raw_json(x):
    if pd.isna(x): return {}
    s = str(x)
    try: return json.loads(s)
    except: pass
    try: return ast.literal_eval(s)
    except: return {}

def only_alnum_upper(s):
    if not s or (isinstance(s, float) and math.isnan(s)): return ""
    return "".join(ch for ch in str(s) if ch.isalnum()).upper()

# --- Vehicle Number Cleaning ---
def clean_vehicle_token(s: str) -> str:
    """Fix OCR/typo issues inside vehicle numbers."""
    if not s: return ""
    s = s.upper()
    s = s.replace("O", "0")
    s = s.replace("I", "1")
    s = s.replace("L", "1")
    s = s.replace("S", "5")  # optional, India sometimes uses real S
    s = re.sub(r"[^A-Z0-9]", "", s)  # remove dashes, spaces
    return s

def normalize_vehicle_no(v: str) -> str:
    """Extract clean vehicle plate, remove dispatch numbers."""
    if not v: return ""
    tokens = re.split(r"[,&/]", str(v))
    plates = []
    for t in tokens:
        t = t.strip()
        if not t: continue
        if not any(ch.isalpha() for ch in t):  # dispatch only (7645)
            continue
        if not any(ch.isdigit() for ch in t):
            continue
        plates.append(clean_vehicle_token(only_alnum_upper(t)))
    return plates[0] if plates else ""

def vehicle_fuzzy_match(a, b, threshold=0.85):
    """Fuzzy compare two vehicle numbers after cleaning."""
    a_n, b_n = normalize_vehicle_no(a), normalize_vehicle_no(b)
    if not a_n or not b_n: return False
    if a_n == b_n: return True
    return SequenceMatcher(None, a_n, b_n).ratio() >= threshold

# --- Invoice & Eway Numbers ---
def normalize_invoice_number_inv(inv_no):
    if not inv_no: return ""
    s = str(inv_no).strip()
    if "/" in s:
        for p in reversed(s.split("/")):
            if any(ch.isdigit() for ch in p):
                return "".join(ch for ch in p if ch.isdigit())
    return only_alnum_upper(s)

def normalize_invoice_number_eway(inv_no):
    if not inv_no: return ""
    s = str(inv_no).strip()
    if "/" in s:
        for p in s.split("/"):
            if any(ch.isdigit() for ch in p):
                return "".join(ch for ch in p if ch.isdigit())
    return only_alnum_upper(s)

def normalize_eway_bill_no(s):
    return only_alnum_upper(s)

# --- Date ---
def normalize_date(dt):
    if not dt or (isinstance(dt, float) and math.isnan(dt)):
        return ""
    s = str(dt).strip()
    ts = pd.to_datetime(s, errors="coerce", dayfirst=True)
    if pd.notna(ts):
        try: ts = ts.tz_localize(None)
        except: pass
        return ts.strftime("%d%m%Y")
    ts2 = pd.to_datetime(s, errors="coerce", dayfirst=False)
    if pd.notna(ts2):
        try: ts2 = ts2.tz_localize(None)
        except: pass
        return ts2.strftime("%d%m%Y")
    digits = re.sub(r"\D", "", s)
    if len(digits) == 8:
        try:
            if digits.startswith(("19","20")):
                y,m,d = int(digits[:4]),int(digits[4:6]),int(digits[6:8])
            else:
                d,m,y = int(digits[:2]),int(digits[2:4]),int(digits[4:8])
            return datetime(y,m,d).strftime("%d%m%Y")
        except: return ""
    return ""

# --- Company Name Cleaning ---
COMMON_SUFFIXES = [
    "PRIVATE LIMITED", "PVT LTD", "PVT. LTD.", "LTD", "LIMITED",
    "LLP", "DIVISION", "CHEMICAL DIVISION", "CHEM DIVISION",
    "ENTERPRISES", "INDUSTRIES", "TRADERS", "TRADRES", "TRADER"
]

def normalize_company_name(name: str) -> str:
    if not name: return ""
    s = str(name).upper()
    s = re.sub(r"[^A-Z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if s.startswith("M S "): s = s.replace("M S ", "", 1)
    if s.startswith("MS "): s = s.replace("MS ", "", 1)
    for suffix in COMMON_SUFFIXES:
        if s.endswith(" " + suffix):
            s = s[: -len(suffix)].strip()
    return s

def company_fuzzy_match(a, b, threshold=0.9):
    if not a or not b: return False
    a_n, b_n = normalize_company_name(a), normalize_company_name(b)
    if a_n == b_n: return True
    return SequenceMatcher(None, a_n, b_n).ratio() >= threshold

# --- Plastic Type ---
def normalize_plastic_type(ptype):
    if not ptype or not isinstance(ptype, str): return ""
    s = ptype.strip().upper()
    if "PET" in s: return "PET"
    if "HDPE" in s: return "HDPE"
    if "LDPE" in s: return "LDPE"
    if "PP" in s or "POLYPROPYLENE" in s: return "PP"
    return "OTHER"

# --- Weight ---
def normalize_weight_decimal_rule(value):
    if value is None or str(value).strip() == "": return None
    try: v = float(str(value).replace(",","").strip())
    except: return None
    if "." in str(value):
        if 55.0 <= v <= 550.0: return (v/10.0)*1000.0
        if v > 550.0: return v
        return v*1000.0
    return v

# ---------- Matching ----------
def recompute_matches(inv_norm, eway_norm, user_id, user_name):
    rows = []
    used_invoice_ids = set()
    inv_index = {}

    for _, r in inv_norm.iterrows():
        key = (user_id, r.get("invoice_norm",""), r.get("date_norm",""))
        inv_index.setdefault(key, []).append(r)

    def weight_diff(a,b): return abs(a-b) if (pd.notna(a) and pd.notna(b)) else None

    for _, e in eway_norm.iterrows():
        key = (user_id, e.get("invoice_norm",""), e.get("date_norm",""))
        candidates = inv_index.get(key, [])
        filtered = []
        for inv in candidates:
            if e.get("vehicle_norm") and inv.get("vehicle_norm"):
                veh_match = vehicle_fuzzy_match(e.get("vehicle_norm"), inv.get("vehicle_norm"))
            else:
                veh_match = company_fuzzy_match(e.get("ship_from_company_name",""), inv.get("bill_from_company_name",""))
            if veh_match: filtered.append(inv)
        filtered_ids = {inv["id"] for inv in filtered}
        pool = filtered if filtered else candidates

        best, best_score, best_wd = None, None, None
        for inv in pool:
            if inv["id"] in used_invoice_ids: continue
            wd = weight_diff(e.get("weight_kg"), inv.get("weight_kg"))
            within_tol = True if (pd.isna(e.get("weight_kg")) or pd.isna(inv.get("weight_kg"))) else (wd == 0)
            veh_company_matched = (inv["id"] in filtered_ids)
            score_tuple = (0 if veh_company_matched else 1, 0 if within_tol else 1, wd if wd is not None else 1e9)
            if (best is None) or (score_tuple < best_score):
                best, best_score, best_wd = inv, score_tuple, wd

        if best is None: continue

        invoice_file_url, ewaybill_file_url = best.get("file_url"), e.get("file_url")
        plastic_invoice, plastic_eway = normalize_plastic_type(best.get("plastic_type","")), normalize_plastic_type(e.get("plastic_type",""))
        plastic_type = plastic_invoice or plastic_eway or ""

        flags, flagged_pair_value = [], ""
        if not vehicle_fuzzy_match(e.get("vehicle_number",""), best.get("vehicle_number","")):
            flags.append("vehicle_mismatch")
            flagged_pair_value = f"{e.get('vehicle_number','')} vs {best.get('vehicle_number','')}"
        if not company_fuzzy_match(e.get("ship_from_company_name",""), best.get("bill_from_company_name","")):
            flags.append("company_from_mismatch")
            if not flagged_pair_value:
                flagged_pair_value = f"{e.get('ship_from_company_name','')} vs {best.get('bill_from_company_name','')}"

        in_compliance = True
        if pd.notna(e.get("weight_kg")) and pd.notna(best.get("weight_kg")) and best_wd != 0:
            flags.append("weight_mismatch")
            in_compliance = False
        else:
            used_invoice_ids.add(best["id"])

        invoice_weight_mt = None
        if pd.notna(best.get("weight_kg")):
            invoice_weight_mt = int(round(best.get("weight_kg")/1000.0))

        # Get created_at from either invoice or ewaybill, preferring invoice
        created_at = best.get("created_at") or e.get("created_at", "")
        
        row = {
            "user_id": user_id, "user_name": user_name,
            "invoice_file_url": invoice_file_url, "ewaybill_file_url": ewaybill_file_url,
            "invoice_weight_mt": invoice_weight_mt if invoice_weight_mt is not None else 0,
            "bill_from_company_name": best.get("bill_from_company_name"),
            "ship_to_company_name": e.get("ship_to_company_name"),
            "bill_to_address": best.get("bill_to_address"),
            "plastic_type": plastic_type,
            "ship_to_country_code": (e.get("ship_to_country_code") or "").upper(),
            "vehicle_number": e.get("vehicle_number"),
            "generated_date": e.get("generated_date"),
            "created_at": created_at,
            "flagged": "yes" if flags else "no",
            "flag_reason": ",".join(flags),
            "flagged_pair_value": flagged_pair_value,
            "in_compliance": "yes" if in_compliance else "no",
        }
        rows.append(row)

    return pd.DataFrame(rows)

# ---------- Main Pipeline ----------
def run_pipeline_to_single_csv(input_file, output_dir="."):
    os.makedirs(output_dir, exist_ok=True)
    df = pd.read_csv(input_file)

    invoices, ewaybills = [], []
    for _, row in df.iterrows():
        d = parse_raw_json(row["raw_json"])
        user_id = str(row.get("user_id"))
        user_name = USER_MAP.get(user_id, "unknown")
        base = {
            "id": row["id"], 
            "user_id": user_id, 
            "user_name": user_name, 
            "file_url": row.get("file_url"), 
            "raw_json": row["raw_json"],
            "created_at": row.get("created_at", "")  # Add created_at to base data
        }
        doc_type = str(row["document_type"]).lower()
        if doc_type == "invoice":
            invoices.append({**base,
                "invoice": d.get("invoice"), "invoice_date": d.get("invoice_date"),
                "vehicle_number": d.get("vehicle_number"),
                "bill_from_company_name": d.get("bill_from_company_name"),
                "bill_to_company_name": d.get("bill_to_company_name"),
                "bill_to_address": d.get("bill_to_address"),
                "plastic_type": d.get("plastic_type"),
                "weight": d.get("weight"), "weight_kg": normalize_weight_decimal_rule(d.get("weight")),
            })
        elif doc_type in ["ewaybill","eway-bill","e-way-bill","e-way bill","e way bill","eway bill"]:
            ewaybills.append({**base,
                "invoice": d.get("invoice"), "generated_date": d.get("generated_date"),
                "vehicle_number": d.get("vehicle_number"),
                "ship_from_company_name": d.get("ship_from_company_name"),
                "ship_to_company_name": d.get("ship_to_company_name"),
                "ship_to_country_code": d.get("ship_to_country_code"),
                "eway_bill_no": d.get("eway_bill_no"), "plastic_type": d.get("plastic_type"),
                "weight": d.get("weight"), "weight_kg": normalize_weight_decimal_rule(d.get("weight")),
            })

    inv_df, eway_df = pd.DataFrame(invoices), pd.DataFrame(ewaybills)

    if not inv_df.empty:
        inv_df = inv_df.drop_duplicates(subset=["invoice","invoice_date","weight"], keep="first")
        inv_df["invoice_norm"] = inv_df["invoice"].apply(normalize_invoice_number_inv)
        inv_df["date_norm"] = inv_df["invoice_date"].apply(normalize_date)
        inv_df["vehicle_norm"] = inv_df["vehicle_number"].apply(normalize_vehicle_no)
        inv_df["company_norm"] = inv_df["bill_from_company_name"].apply(normalize_company_name)

    if not eway_df.empty:
        eway_df["eway_bill_no_norm"] = eway_df["eway_bill_no"].fillna("").astype(str).str.replace(r"[^0-9A-Za-z]","",regex=True).str.upper()
        eway_df = eway_df.drop_duplicates(subset=["eway_bill_no_norm"], keep="first")
        eway_df["invoice_norm"] = eway_df["invoice"].apply(normalize_invoice_number_eway)
        eway_df["date_norm"] = eway_df["generated_date"].apply(normalize_date)
        eway_df["vehicle_norm"] = eway_df["vehicle_number"].apply(normalize_vehicle_no)
        eway_df["company_norm"] = eway_df["ship_from_company_name"].apply(normalize_company_name)
        eway_df["eway_norm"] = eway_df["eway_bill_no"].apply(normalize_eway_bill_no)

    out_frames = []
    if "user_id" in df.columns:
        for user_id in df["user_id"].dropna().unique():
            user_id = str(user_id)
            user_name = USER_MAP.get(user_id, "unknown")
            inv_u = inv_df[inv_df["user_id"]==user_id] if not inv_df.empty else pd.DataFrame()
            ewy_u = eway_df[eway_df["user_id"]==user_id] if not eway_df.empty else pd.DataFrame()
            if inv_u.empty and ewy_u.empty: continue
            out_frames.append(recompute_matches(inv_u, ewy_u, user_id, user_name))
    else:
        out_frames.append(recompute_matches(inv_df, eway_df, user_id="", user_name=""))

    final_df = pd.concat(out_frames, ignore_index=True) if out_frames else pd.DataFrame(columns=[
        "user_id","user_name","invoice_file_url","ewaybill_file_url","invoice_weight_mt",
        "bill_from_company_name","ship_to_company_name","bill_to_address","plastic_type",
        "ship_to_country_code","vehicle_number","generated_date","created_at",
        "flagged","flag_reason","flagged_pair_value","in_compliance","city"
    ])

    # Extract cities from bill_to_address using Gemini API
    if not final_df.empty:
        unique_addresses = final_df["bill_to_address"].dropna().unique().tolist()
        city_cache = extract_cities_with_gemini(unique_addresses)
        final_df["city"] = final_df["bill_to_address"].map(city_cache).fillna("")

    col_order = ["user_id","user_name","invoice_file_url","ewaybill_file_url","invoice_weight_mt",
        "bill_from_company_name","ship_to_company_name","bill_to_address","plastic_type","ship_to_country_code","vehicle_number",
        "generated_date","created_at","flagged","flag_reason","flagged_pair_value","in_compliance","city"]
    for c in col_order:
        if c not in final_df.columns: final_df[c] = ""
    final_df = final_df[col_order]

    out_path = os.path.join(output_dir, "dashboard_input.csv")
    final_df.to_csv(out_path, index=False)
    return out_path, final_df.shape

# ---------- Run ----------
if __name__ == "__main__":
    input_file = "input_folder/parsed_documents_rows.csv"
    output_dir = "output_folder"
    path, shape = run_pipeline_to_single_csv(input_file, output_dir)
    print(f"Dashboard input saved to: {os.path.abspath(path)} with shape {shape}")
