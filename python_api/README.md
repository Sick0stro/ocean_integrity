# Python Matching API

FastAPI service that wraps `dashboard_backend.py` logic with REST endpoints.

## Setup

1. **Create virtual environment:**
   ```bash
   cd python_api
   python -m venv venv
   ```

2. **Activate virtual environment:**
   
   Windows:
   ```bash
   venv\Scripts\activate
   ```
   
   Mac/Linux:
   ```bash
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run server:**
   ```bash
   python main.py
   ```
   
   Or with uvicorn directly:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

## Endpoints

### `POST /api/compute-matches`

Compute invoice-eway bill matches for a user.

**Request:**
```json
{
  "user_id": "c9c61043-ce21-4303-bb16-61f883f2f619",
  "supabase_url": "https://your-project.supabase.co",
  "supabase_key": "your-anon-key"
}
```

**Response:**
```json
{
  "success": true,
  "matched_count": 3,
  "compliant_count": 2,
  "flagged_count": 1,
  "records": [...]
}
```

### `GET /api/dashboard-metrics`

Get dashboard KPIs for a user.

**Query Params:**
- `user_id`: User ID
- `supabase_url`: Supabase URL
- `supabase_key`: Supabase anon key

**Response:**
```json
{
  "total_records": 3,
  "total_weight_mt": 150,
  "compliant_records": 2,
  "flagged_records": 1,
  "percent_flagged": 33.33,
  "active_users": 1
}
```

## Integration with Next.js

The Next.js API routes will proxy requests to this Python service.

See `app/api/cron/compute-matches/route.ts` for integration example.

## Testing

Test the API with curl:

```bash
# Health check
curl http://localhost:8000/health

# Compute matches (replace with your values)
curl -X POST http://localhost:8000/api/compute-matches \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "your-user-id",
    "supabase_url": "https://your-project.supabase.co",
    "supabase_key": "your-anon-key"
  }'
```

## Deployment

### Docker (Recommended)

See `Dockerfile` in this directory.

### Manual

Ensure Python 3.9+ is installed on server, then:

1. Clone repo
2. `cd python_api`
3. `pip install -r requirements.txt`
4. `python main.py`

The service will run on `http://0.0.0.0:8000`.
