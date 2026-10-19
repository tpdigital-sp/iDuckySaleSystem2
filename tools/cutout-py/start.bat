@echo off
rem ============================================================
rem  iDucky cutout-py (Windows) - double-click to start
rem  Background removal AI + make layered .ai with Adobe Illustrator
rem  Used by: iduckystore.com admin (order page "redo .ai" button,
rem           design screen, /admin/diecut tab "bg")
rem  First run: installs libraries + downloads AI model (~1 GB)
rem  After setup it runs in the background and starts with Windows.
rem  Debug with a visible window:  start.bat console
rem  (Thai guide: README-Windows.txt)
rem ============================================================
setlocal
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
set "PY=.venv\Scripts\python.exe"

if exist "%PY%" goto run

echo.
echo [1/3] First-time setup: creating Python environment...
rem Libraries are pinned for Python 3.12 / 3.11 (3.13+ has no matching wheels)
set "BASEPY="
py -3.12 -c "1" >nul 2>nul && set "BASEPY=py -3.12"
if not defined BASEPY py -3.11 -c "1" >nul 2>nul && set "BASEPY=py -3.11"
if not defined BASEPY python -c "import sys; sys.exit(0 if sys.version_info[:2] in ((3,11),(3,12)) else 1)" >nul 2>nul && set "BASEPY=python"
if not defined BASEPY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "BASEPY="%LOCALAPPDATA%\Programs\Python\Python312\python.exe""
if not defined BASEPY goto installpy
:havepy

%BASEPY% -m venv .venv
if errorlevel 1 goto nopython
if not exist "%PY%" goto nopython

echo [2/3] Installing libraries (5-15 minutes, please wait)...
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r requirements-windows.txt
if errorlevel 1 goto pipfail

:run
rem Libraries added later (e.g. pymupdf) - install if missing
"%PY%" -c "import fitz, rembg, cv2" >nul 2>nul
if errorlevel 1 (
  echo Installing missing libraries...
  "%PY%" -m pip install -r requirements-windows.txt
  if errorlevel 1 goto pipfail
)
if /i "%~1"=="console" goto console

echo.
echo [3/3] Auto-start setup + starting in background...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" -Dir "%~dp0." -Start
if errorlevel 1 goto startfail
echo.
echo Done. cutout-py now runs in the background (no window needed)
echo   - starts automatically every time Windows logs in
echo   - the website can also start it (allow "iducky-cutout" when the browser asks)
echo   You can close this window.
echo.
pause
exit /b 0

:console
rem Debug mode: run with a visible window (start.bat console)
echo.
echo Starting cutout-py at http://localhost:8777 (console mode - keep this window open)
echo.
"%PY%" app.py --no-browser
echo.
echo Program stopped.
pause
exit /b 0

:startfail
echo.
echo ERROR: cutout-py did not start (see messages above / cutout-py.log).
echo   Try "start.bat console" to see the error on screen.
echo.
pause
exit /b 1

:installpy
rem No Python 3.12/3.11 (none installed, or only 3.13+) - install 3.12 for this Windows user.
rem Per-user quiet install: no admin rights, no installer clicks. 3.12.10 = last official 3.12 installer.
echo.
echo Python 3.12 not found - downloading and installing it now (27 MB, 1-3 minutes). Do not close this window.
rem $ProgressPreference off: Windows PowerShell 5 progress bar makes Invoke-WebRequest 10x+ slower (looks frozen)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; $f=Join-Path $env:TEMP 'python-3.12.10-amd64.exe'; Write-Host '  downloading...'; Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile $f; Write-Host ('  downloaded ' + [math]::Round((Get-Item $f).Length/1MB,1) + ' MB - installing (1-2 minutes, no window will appear)...'); $p=Start-Process -FilePath $f -ArgumentList '/quiet','InstallAllUsers=0','PrependPath=1','Include_launcher=1','InstallLauncherAllUsers=0','Include_test=0' -Wait -PassThru; Write-Host ('  installer finished, code ' + $p.ExitCode); exit $p.ExitCode"
set "PYNEW=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not exist "%PYNEW%" goto nopython
echo Python 3.12 installed.
set "BASEPY="%PYNEW%""
goto havepy

:nopython
echo.
echo ERROR: Python 3.12 (or 3.11) not found and automatic install failed.
echo   Install Python 3.12.10 by hand: https://www.python.org/downloads/release/python-31210/
echo   ("Windows installer (64-bit)")
echo   and TICK "Add python.exe to PATH" on the first installer screen.
echo   Then double-click start.bat again.
echo.
if exist ".venv" rmdir /s /q ".venv"
pause
exit /b 1

:pipfail
echo.
echo ERROR: library install failed (check internet, then run start.bat again).
echo   If it keeps failing, delete the ".venv" folder and try again.
echo.
pause
exit /b 1
