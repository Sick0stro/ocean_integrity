@echo off
echo Starting Ocean Integrity Development Server...
echo.

echo [1/4] Killing existing Node.js processes...
taskkill /f /im node.exe 2>nul >nul || echo No existing processes found.

echo [2/4] Cleaning build cache...
if exist .next rmdir /s /q .next 2>nul >nul
if exist node_modules\.cache rmdir /s /q node_modules\.cache 2>nul >nul

echo [3/4] Setting up environment...
set NODE_OPTIONS=--max-old-space-size=4096
set NEXT_TELEMETRY_DISABLED=1
set TURBOPACK=1

echo [4/4] Starting development server with Turbopack...
echo.
echo Server will be available at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

npm run dev
