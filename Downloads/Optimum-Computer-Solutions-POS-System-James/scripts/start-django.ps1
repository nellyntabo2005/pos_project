$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DjangoRoot = Join-Path $ProjectRoot "backend\backend"
$Python = Join-Path $DjangoRoot "venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
  $Python = Join-Path $DjangoRoot "venvdir\Scripts\python.exe"
}
$LogDir = Join-Path $DjangoRoot "logs"
$OutLog = Join-Path $LogDir "django-autostart.log"
$ErrLog = Join-Path $LogDir "django-autostart.err"

if (-not (Test-Path $Python)) {
  throw "Django Python interpreter was not found at $Python"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$Existing = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($Existing) {
  exit 0
}

Start-Process `
  -FilePath $Python `
  -ArgumentList @("manage.py", "runserver", "127.0.0.1:8000", "--noreload") `
  -WorkingDirectory $DjangoRoot `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -WindowStyle Hidden
