# Creates a "Hustle HQ" shortcut on the Windows desktop (run: npm run shortcut).
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Hustle HQ.lnk'
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\desktop\launch.ps1`""
$s.WorkingDirectory = $root
$s.IconLocation = "$root\desktop\hustle-hq.ico,0"
$s.Description = 'Hustle HQ - your AI office'
$s.WindowStyle = 7
$s.Save()
Write-Host "Shortcut created: $lnk"
