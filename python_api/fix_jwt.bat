@echo off
echo Fixing PyJWT version conflict...
echo.

REM Uninstall conflicting version
pip uninstall -y PyJWT

REM Install correct version
pip install PyJWT==2.9.0

echo.
echo ✅ PyJWT fixed!
echo.
pause
