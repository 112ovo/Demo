@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未找到 Node.js。请先安装 Node.js 18 或更高版本：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo 正在启动塔防 Demo，稍等会自动弹出应用窗口…
echo 关闭应用窗口即可退出；也可以在这个窗口按 Ctrl+C 结束。
echo.

node "app\launcher.mjs"
set "rc=%errorlevel%"
if not "%rc%"=="0" (
  echo.
  echo 启动器退出，代码 %rc%。
  pause
)
endlocal
