@echo off
echo ============================================
echo  BLS Extension - Chrome Installer
echo ============================================
echo.
echo This will open Chrome Extensions page.
echo.
echo STEPS TO INSTALL:
echo 1. Enable "Developer mode" (top-right toggle)
echo 2. Click "Load unpacked"
echo 3. Select this folder: %~dp0
echo.
echo Opening Chrome Extensions page...
echo.
start chrome://extensions/
echo.
echo Extension folder location:
echo %~dp0
echo.
echo After loading the extension:
echo - Visit: https://morocco.blsportugal.com/MAR/account/login
echo - Extension UI will appear automatically
echo.
pause
