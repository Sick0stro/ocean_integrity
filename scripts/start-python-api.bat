@echo off
echo Starting Python Matching API...
echo.

cd python_api

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
call venv\Scripts\activate

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Start server
echo.
echo ========================================
echo Python API running on http://localhost:8000
echo ========================================
echo.

python main.py
