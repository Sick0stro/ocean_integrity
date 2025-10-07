"""
FastAPI service for invoice-eway bill matching
Wraps dashboard_backend.py logic with REST API endpoints
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import sys
import os
import pandas as pd

# Add parent directory to path to import dashboard_backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import dashboard_backend as backend

app = FastAPI(title="Ocean Integrity Matching API", version="1.0.0")

# CORS middleware for Next.js (port 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========================================
# REQUEST/RESPONSE MODELS
# ========================================

class ComputeMatchesRequest(BaseModel):
    user_id: str
    supabase_url: str
    supabase_key: str

class MatchedRecord(BaseModel):
    user_id: str
    user_name: str
    invoice_file_url: Optional[str]
    ewaybill_file_url: Optional[str]
    invoice_weight_mt: int
    bill_from_company_name: Optional[str]
    ship_to_company_name: Optional[str]
    bill_to_address: Optional[str]
    plastic_type: str
    ship_to_country_code: str
    city: Optional[str]
    vehicle_number: Optional[str]
    generated_date: Optional[str]
    created_at: str
    flagged: str
    flag_reason: str
    flagged_pair_value: str
    in_compliance: str

class ComputeMatchesResponse(BaseModel):
    success: bool
    matched_count: int
    compliant_count: int
    flagged_count: int
    records: List[MatchedRecord]

class DashboardMetricsResponse(BaseModel):
    total_records: int
    total_weight_mt: int
    compliant_records: int
    flagged_records: int
    percent_flagged: float
    active_users: int

# ========================================
# ENDPOINTS
# ========================================

@app.get("/")
def root():
    return {
        "service": "Ocean Integrity Matching API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

@app.post("/api/compute-matches", response_model=ComputeMatchesResponse)
async def compute_matches(request: ComputeMatchesRequest):
    """
    Compute invoice-eway bill matches for a user
    
    This endpoint:
    1. Fetches parsed_documents from Supabase for the user
    2. Runs the matching algorithm from dashboard_backend.py
    3. Returns matched pairs with flags and compliance info
    """
    try:
        print(f"🔄 [matching-api] Computing matches for user: {request.user_id}")
        
        # Import Supabase client
        from supabase import create_client, Client
        
        # Initialize Supabase client
        supabase: Client = create_client(request.supabase_url, request.supabase_key)
        
        # Fetch parsed documents for the user
        response = supabase.table('parsed_documents').select(
            'id, user_id, document_type, raw_json, file_url, created_at, weight_kg_normalized'
        ).eq('user_id', request.user_id).execute()
        
        if not response.data:
            print(f"⚠️ [matching-api] No parsed documents found for user {request.user_id}")
            return ComputeMatchesResponse(
                success=True,
                matched_count=0,
                compliant_count=0,
                flagged_count=0,
                records=[]
            )
        
        # Convert to DataFrame (simulates CSV input)
        df = pd.DataFrame(response.data)
        
        print(f"📊 [matching-api] Found {len(df)} parsed documents")
        
        # Separate invoices and eway bills
        invoices = []
        ewaybills = []
        
        for _, row in df.iterrows():
            raw_json = backend.parse_raw_json(row['raw_json'])
            user_id = str(row['user_id'])
            user_name = backend.USER_MAP.get(user_id, 'unknown')
            
            base = {
                'id': row['id'],
                'user_id': user_id,
                'user_name': user_name,
                'file_url': row.get('file_url'),
                'raw_json': row['raw_json'],
                'created_at': row.get('created_at', '')
            }
            
            doc_type = str(row['document_type']).lower()
            
            if doc_type == 'invoice':
                invoices.append({
                    **base,
                    'invoice': raw_json.get('invoice'),
                    'invoice_date': raw_json.get('invoice_date'),
                    'vehicle_number': raw_json.get('vehicle_number'),
                    'bill_from_company_name': raw_json.get('bill_from_company_name'),
                    'bill_to_company_name': raw_json.get('bill_to_company_name'),
                    'bill_to_address': raw_json.get('bill_to_address'),
                    'plastic_type': raw_json.get('plastic_type'),
                    'weight': raw_json.get('weight'),
                    'weight_kg': backend.normalize_weight_decimal_rule(raw_json.get('weight'))
                })
            elif doc_type in ['ewaybill', 'eway-bill', 'e-way-bill', 'e-way bill', 'e way bill', 'eway bill']:
                ewaybills.append({
                    **base,
                    'invoice': raw_json.get('invoice'),
                    'generated_date': raw_json.get('generated_date'),
                    'vehicle_number': raw_json.get('vehicle_number'),
                    'ship_from_company_name': raw_json.get('ship_from_company_name'),
                    'ship_to_company_name': raw_json.get('ship_to_company_name'),
                    'ship_to_country_code': raw_json.get('ship_to_country_code'),
                    'eway_bill_no': raw_json.get('eway_bill_no'),
                    'plastic_type': raw_json.get('plastic_type'),
                    'weight': raw_json.get('weight'),
                    'weight_kg': backend.normalize_weight_decimal_rule(raw_json.get('weight'))
                })
        
        print(f"📊 [matching-api] Invoices: {len(invoices)}, Eway bills: {len(ewaybills)}")
        
        if not invoices or not ewaybills:
            print(f"⚠️ [matching-api] Insufficient documents for matching")
            return ComputeMatchesResponse(
                success=True,
                matched_count=0,
                compliant_count=0,
                flagged_count=0,
                records=[]
            )
        
        # Convert to DataFrames
        inv_df = pd.DataFrame(invoices)
        eway_df = pd.DataFrame(ewaybills)
        
        # Deduplicate invoices
        inv_df = inv_df.drop_duplicates(subset=['invoice', 'invoice_date', 'weight'], keep='first')
        
        # Normalize invoice fields
        inv_df['invoice_norm'] = inv_df['invoice'].apply(backend.normalize_invoice_number_inv)
        inv_df['date_norm'] = inv_df['invoice_date'].apply(backend.normalize_date)
        inv_df['vehicle_norm'] = inv_df['vehicle_number'].apply(backend.normalize_vehicle_no)
        inv_df['company_norm'] = inv_df['bill_from_company_name'].apply(backend.normalize_company_name)
        
        # Deduplicate eway bills by eway_bill_no
        eway_df['eway_bill_no_norm'] = eway_df['eway_bill_no'].fillna('').astype(str).str.replace(r'[^0-9A-Za-z]', '', regex=True).str.upper()
        eway_df = eway_df.drop_duplicates(subset=['eway_bill_no_norm'], keep='first')
        
        # Normalize eway fields
        eway_df['invoice_norm'] = eway_df['invoice'].apply(backend.normalize_invoice_number_eway)
        eway_df['date_norm'] = eway_df['generated_date'].apply(backend.normalize_date)
        eway_df['vehicle_norm'] = eway_df['vehicle_number'].apply(backend.normalize_vehicle_no)
        eway_df['company_norm'] = eway_df['ship_from_company_name'].apply(backend.normalize_company_name)
        eway_df['eway_norm'] = eway_df['eway_bill_no'].apply(backend.normalize_eway_bill_no)
        
        # Run matching algorithm
        user_name = backend.USER_MAP.get(request.user_id, 'unknown')
        matched_df = backend.recompute_matches(inv_df, eway_df, request.user_id, user_name)
        
        print(f"✅ [matching-api] Computed {len(matched_df)} matches")
        
        # Extract cities from bill_to_address using Gemini API
        if not matched_df.empty and 'bill_to_address' in matched_df.columns:
            unique_addresses = matched_df['bill_to_address'].dropna().unique().tolist()
            if unique_addresses:
                print(f"🌍 [matching-api] Extracting cities for {len(unique_addresses)} addresses...")
                city_cache = backend.extract_cities_with_gemini(unique_addresses)
                matched_df['city'] = matched_df['bill_to_address'].map(city_cache).fillna('')
                print(f"✅ [matching-api] City extraction completed")
            else:
                matched_df['city'] = ''
        else:
            matched_df['city'] = ''
        
        # Convert to response format
        records = []
        for _, row in matched_df.iterrows():
            records.append(MatchedRecord(
                user_id=str(row['user_id']),
                user_name=str(row['user_name']),
                invoice_file_url=row.get('invoice_file_url'),
                ewaybill_file_url=row.get('ewaybill_file_url'),
                invoice_weight_mt=int(row['invoice_weight_mt']) if pd.notna(row['invoice_weight_mt']) else 0,
                bill_from_company_name=row.get('bill_from_company_name'),
                ship_to_company_name=row.get('ship_to_company_name'),
                bill_to_address=row.get('bill_to_address'),
                plastic_type=str(row.get('plastic_type', '')),
                ship_to_country_code=str(row.get('ship_to_country_code', '')),
                city=row.get('city', ''),
                vehicle_number=row.get('vehicle_number'),
                generated_date=row.get('generated_date'),
                created_at=str(row.get('created_at', '')),
                flagged=str(row['flagged']),
                flag_reason=str(row.get('flag_reason', '')),
                flagged_pair_value=str(row.get('flagged_pair_value', '')),
                in_compliance=str(row['in_compliance'])
            ))
        
        # Compute counts
        compliant_count = len(matched_df[matched_df['in_compliance'] == 'yes'])
        flagged_count = len(matched_df[matched_df['flagged'] == 'yes'])
        
        return ComputeMatchesResponse(
            success=True,
            matched_count=len(records),
            compliant_count=compliant_count,
            flagged_count=flagged_count,
            records=records
        )
        
    except Exception as e:
        print(f"❌ [matching-api] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard-metrics", response_model=DashboardMetricsResponse)
async def get_dashboard_metrics(
    user_id: str,
    supabase_url: str,
    supabase_key: str
):
    """
    Get dashboard metrics (KPIs) for a user
    
    Fetches matched_records from Supabase and computes:
    - Total records
    - Total weight (MT)
    - Compliant records
    - Flagged records
    - % Flagged
    - Active users
    """
    try:
        print(f"📊 [dashboard-metrics-api] Fetching metrics for user: {user_id}")
        
        from supabase import create_client, Client
        supabase: Client = create_client(supabase_url, supabase_key)
        
        # Fetch matched records for user
        response = supabase.table('matched_records').select('*').eq('user_id', user_id).execute()
        
        if not response.data:
            return DashboardMetricsResponse(
                total_records=0,
                total_weight_mt=0,
                compliant_records=0,
                flagged_records=0,
                percent_flagged=0.0,
                active_users=0
            )
        
        df = pd.DataFrame(response.data)
        
        total_records = len(df)
        total_weight_mt = int(df['invoice_weight_mt'].sum()) if 'invoice_weight_mt' in df.columns else 0
        compliant_records = len(df[df['in_compliance'] == 'yes']) if 'in_compliance' in df.columns else 0
        flagged_records = len(df[df['flagged'] == 'yes']) if 'flagged' in df.columns else 0
        percent_flagged = (flagged_records / total_records * 100) if total_records > 0 else 0.0
        active_users = df['user_id'].nunique() if 'user_id' in df.columns else 0
        
        return DashboardMetricsResponse(
            total_records=total_records,
            total_weight_mt=total_weight_mt,
            compliant_records=compliant_records,
            flagged_records=flagged_records,
            percent_flagged=round(percent_flagged, 2),
            active_users=active_users
        )
        
    except Exception as e:
        print(f"❌ [dashboard-metrics-api] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ========================================
# STARTUP
# ========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
