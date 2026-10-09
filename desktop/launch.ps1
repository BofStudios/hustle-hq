# Hustle HQ launcher (Windows).
# Starts the local server in the background if it is not running yet, then opens the game
# in an app window (Chrome or Edge --app). The office keeps running after the window closes;
# stop it from Admin > Shut down server.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$port = 3777
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
  $m = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }
}
$url = "http://localhost:$port"

function Test-Up {
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$url/api/health").StatusCode -eq 200 } catch { return $false }
}

if (-not (Test-Up)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Hustle HQ needs Node.js 24 or newer. The download page will open now.', 'Hustle HQ') | Out-Null
    Start-Process 'https://nodejs.org'
    exit 1
  }
  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm install --no-audit --no-fund' -WorkingDirectory $root -WindowStyle Minimized -Wait
  }
  $logDir = Join-Path $root 'data'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $log = Join-Path $logDir 'server.log'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "node server/index.js > `"$log`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 50 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 300 }
}

if ($env:HQ_NO_BROWSER) { exit 0 } # tests only
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($browser) { Start-Process -FilePath $browser -ArgumentList "--app=$url", '--window-size=1400,900' }
else { Start-Process $url }
