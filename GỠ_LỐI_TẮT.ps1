$ErrorActionPreference = "SilentlyContinue"

$desktop = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktop "GPP Căn Chiếu.lnk"

$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startShortcut = Join-Path $startMenu "GPP Căn Chiếu.lnk"

Remove-Item $desktopShortcut -Force
Remove-Item $startShortcut -Force

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
  "Đã gỡ lối tắt GPP Căn Chiếu khỏi Desktop và Start Menu.`n`nKhông xóa thư mục phần mềm.",
  "Đã gỡ lối tắt",
  "OK",
  "Information"
) | Out-Null
