@echo off
cd /d "%~dp0"

echo Starting desktop pet...

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" src\desktop_pet_app.py
) else (
    python src\desktop_pet_app.py
)

pause