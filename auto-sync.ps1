$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot"

git add -A

$hasChanges = git status --porcelain
if ([string]::IsNullOrWhiteSpace($hasChanges)) {
    exit 0
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "Auto update ($timestamp)"
git push origin main
