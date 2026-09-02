@echo off
setlocal
set PORT=8787

echo 停止作文批改台
echo ==============
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>nul
)

echo 已尝试停止端口 %PORT% 上的本地服务。
pause
