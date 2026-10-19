# iDucky cutout-py (Windows) - auto-start setup. Called by start.bat; current user only, no admin needed.
#   1) URL protocol  iducky-cutout:  -> website can start the program from a click (design screen / redo .ai)
#   2) Startup shortcut -> program starts hidden when Windows logs in
#   -Start   : also start it now (hidden) and wait until http://127.0.0.1:8777 answers
#   -Remove  : undo 1) and 2)
# Keep this file ASCII only (Windows PowerShell 5 reads scripts with the system code page).
param(
  [string]$Dir = $PSScriptRoot,
  [switch]$Start,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Dir = (Resolve-Path $Dir).Path
$key = 'HKCU:\Software\Classes\iducky-cutout'
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'iDucky cutout-py.lnk'
$cmdFallback = Join-Path ([Environment]::GetFolderPath('Startup')) 'iDucky cutout-py.cmd'

if ($Remove) {
  Remove-Item -Path $key -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $lnk, $cmdFallback -Force -ErrorAction SilentlyContinue
  Write-Host 'Removed auto-start and iducky-cutout: link.'
  exit 0
}

$pyw = Join-Path $Dir '.venv\Scripts\pythonw.exe'
$launch = Join-Path $Dir 'launch.pyw'
if (-not (Test-Path $pyw)) { Write-Host "ERROR: not found $pyw (run start.bat first)"; exit 1 }
$launchArgs = '-X utf8 "' + $launch + '"'

# 1) URL protocol (re-written every run, so moving the folder just needs start.bat again)
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:iDucky cutout-py'
New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value ('"' + $pyw + '" ' + $launchArgs + ' "%1"')
Write-Host 'OK  iducky-cutout: link registered'

# 2) Startup shortcut (fallback: small .cmd if shortcuts cannot be created)
try {
  $sh = New-Object -ComObject WScript.Shell
  $s = $sh.CreateShortcut($lnk)
  $s.TargetPath = $pyw
  $s.Arguments = $launchArgs
  $s.WorkingDirectory = $Dir
  $s.Description = 'iDucky cutout-py (background)'
  $s.Save()
  Remove-Item -Path $cmdFallback -Force -ErrorAction SilentlyContinue
  Write-Host 'OK  starts automatically when Windows logs in'
} catch {
  Set-Content -Path $cmdFallback -Encoding ASCII -Value ('@start "" "' + $pyw + '" ' + $launchArgs)
  Write-Host 'OK  starts automatically when Windows logs in (.cmd)'
}

if ($Start) {
  $ready = $null
  try { $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:8777/calendar-ai' -TimeoutSec 2 } catch {}
  if (-not $ready) {
    Start-Process -FilePath $pyw -ArgumentList $launchArgs -WorkingDirectory $Dir -WindowStyle Hidden
    Write-Host 'Starting in background...'
    for ($i = 0; $i -lt 90 -and -not $ready; $i++) {
      Start-Sleep -Seconds 1
      try { $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:8777/calendar-ai' -TimeoutSec 2 } catch {}
    }
  }
  if (-not $ready) {
    Write-Host 'ERROR: program did not start. Last lines of cutout-py.log:'
    $log = Join-Path $Dir 'cutout-py.log'
    if (Test-Path $log) { Get-Content -Path $log -Tail 30 -Encoding UTF8 }
    exit 2
  }
  Write-Host ('READY  http://localhost:8777   Illustrator found: ' + $ready.illustrator)
  if (-not $ready.illustrator) { Write-Host 'WARNING: Adobe Illustrator not found - open Illustrator once, then run start.bat again.' }
}
exit 0
