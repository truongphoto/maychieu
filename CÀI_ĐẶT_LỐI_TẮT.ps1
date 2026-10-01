$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$indexPath = Join-Path $appDir "index.html"
$iconPath = Join-Path $appDir "assets\GPP_Can_Chieu.ico"

$edgeCandidates = @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "Không tìm thấy Microsoft Edge. Hãy cài Edge hoặc mở index.html thủ công.",
    "GPP Căn Chiếu",
    "OK",
    "Warning"
  ) | Out-Null
  exit 1
}

$fileUri = "file:///" + ($indexPath -replace "\\","/")
$wsh = New-Object -ComObject WScript.Shell

$desktop = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktop "GPP Căn Chiếu.lnk"
$s = $wsh.CreateShortcut($desktopShortcut)
$s.TargetPath = $edge
$s.Arguments = "--app=`"$fileUri`" --start-maximized"
$s.WorkingDirectory = $appDir
$s.IconLocation = "$iconPath,0"
$s.Description = "GPP Căn Chiếu"
$s.Save()

$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$startShortcut = Join-Path $startMenu "GPP Căn Chiếu.lnk"
$s2 = $wsh.CreateShortcut($startShortcut)
$s2.TargetPath = $edge
$s2.Arguments = "--app=`"$fileUri`" --start-maximized"
$s2.WorkingDirectory = $appDir
$s2.IconLocation = "$iconPath,0"
$s2.Description = "GPP Căn Chiếu"
$s2.Save()

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
  "Đã tạo lối tắt GPP Căn Chiếu trên Desktop và Start Menu.`n`nPhần mềm vẫn nằm nguyên trong thư mục hiện tại.",
  "Cài đặt hoàn tất",
  "OK",
  "Information"
) | Out-Null
