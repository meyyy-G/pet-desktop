@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=.venv\Scripts\python.exe"

rem Keep unrelated tools on the caller's PATH out of PyInstaller's DLL search.
rem In particular, external ICU/UCRT copies can make the frozen Qt app fail.
set "PATH=%CD%\.venv\Scripts;%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\Wbem"

if not exist "%PYTHON_EXE%" (
    echo [ERROR] Virtual environment not found: .venv
    echo Create it with: python -m venv .venv
    exit /b 1
)

"%PYTHON_EXE%" -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PyInstaller is not installed.
    echo Run: "%PYTHON_EXE%" -m pip install -r requirements-dev.txt
    exit /b 1
)

echo Building DesktopPet...
"%PYTHON_EXE%" -m PyInstaller --noconfirm --clean DesktopPet.spec
if errorlevel 1 exit /b 1

echo.
echo Build complete: dist\DesktopPet.exe
endlocal
