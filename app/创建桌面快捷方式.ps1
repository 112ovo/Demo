# 在桌面创建「塔防 Demo」快捷方式（指向 app\启动塔防.vbs，使用 app\icon.ico）
# 用法：右键 -> 使用 PowerShell 运行，或在终端执行：
#   powershell -ExecutionPolicy Bypass -File app\创建桌面快捷方式.ps1

$ErrorActionPreference = 'Stop'

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $appDir
$launcher = Join-Path $appDir '启动塔防.vbs'
$icon = Join-Path $appDir 'icon.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop '塔防 Demo.lnk'

if (-not (Test-Path $launcher)) { throw "找不到启动脚本：$launcher" }

$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = $wscript
$shortcut.Arguments = '"' + $launcher + '"'
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = $icon + ',0'
$shortcut.Description = '塔防 Demo - 零依赖 Canvas 小游戏'
$shortcut.Save()

Write-Host "已创建快捷方式：$lnkPath"
