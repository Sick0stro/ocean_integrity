# Python Matching API Setup Guide

## ✅ What We Created

1. **`python_api/main.py`** - FastAPI service that wraps `dashboard_backend.py`
2. **`python_api/requirements.txt`** - Python dependencies
3. **`scripts/start-python-api.bat`** - Windows startup script
4. **`app/api/cron/compute-matches/route.ts`** - Next.js proxy to Python API

## 🚀 How to Run

### Option 1: Manual Start (Recommended for first time)

1. Open a **NEW terminal window**
2. Navigate to project:

   ```bash
   cd C:\Users\Dimitar\Desktop\ocean_integrity\python_api
   ```

3. Activate virtual environment:

   ```bash
   venv\Scripts\activate
   ```

4. Install dependencies (first time only):

   ```bash
   pip install -r requirements.txt
   ```

5. Start the API:

   ```bash
   python main.py
   ```

6. You should see:
   ```
   INFO:     Uvicorn running on http://0.0.0.0:8000
   INFO:     Application startup complete.
   ```

### Option 2: Use Batch Script

Double-click `scripts\start-python-api.bat` or run:

```bash
scripts\start-python-api.bat
```

## ✅ Verify It's Running

Open browser to: **http://localhost:8000**

You should see:

```json
{
  "service": "Ocean Integrity Matching API",
  "version": "1.0.0",
  "status": "running"
}
```

Or test health endpoint: **http://localhost:8000/health**

## 🔗 Integration with Next.js

Once the Python API is running on port 8000, your Next.js app (port 3000) will automatically call it when:

1. User clicks **"Verify"** button in Dashboard
2. AI processing completes (automatic matching trigger)

## 📊 API Endpoints

### `POST /api/compute-matches`

Computes invoice-eway bill matches using the EXACT logic from `dashboard_backend.py`.

**Request:**

```json
{
  "user_id": "user-uuid",
  "supabase_url": "https://your-project.supabase.co",
  "supabase_key": "your-key"
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

Gets KPIs for the dashboard.

**Query Params:**

- `user_id`
- `supabase_url`
- `supabase_key`

## 🐛 Troubleshooting

### Port 8000 already in use

```bash
# Find process
netstat -ano | findstr :8000

# Kill process (replace PID)
taskkill /PID <PID> /F
```

### Module not found errors

```bash
cd python_api
venv\Scripts\activate
pip install -r requirements.txt
```

### Can't import dashboard_backend

Make sure `dashboard_backend.py` is in the **root folder** (not in python_api).

## 📝 Next Steps

1. ✅ **Start Python API** (port 8000)
2. ✅ **Keep Next.js running** (port 3000)
3. ✅ **Process some documents** in the UI
4. ✅ **Click "Verify" button** in Dashboard tab
5. ✅ **Watch console logs** to see Python API calls

The matching will now use the EXACT Python logic from `dashboard_backend.py` - no translation errors! 🎉
