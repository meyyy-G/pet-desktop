@echo off
rem 只运行 web 目录中的独立模块测试页面。
cd /d "%~dp0\..\..\.."

echo Starting diary web module test...

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" src\desktop_pet\web\test_web.py
) else (
    python src\desktop_pet\web\test_web.py
)

if errorlevel 1 (
    echo.
    echo Test failed. Please copy the error above.
    pause
)
