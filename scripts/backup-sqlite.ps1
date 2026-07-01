param(
  [string]$DataDir = ".\data",
  [string]$BackupDir = ".\backups"
)

$resolvedDataDir = Resolve-Path -LiteralPath $DataDir -ErrorAction Stop
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$targetDir = Join-Path $BackupDir "minical-$timestamp"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$patterns = @("minical.sqlite3", "minical.sqlite3-wal", "minical.sqlite3-shm")
foreach ($pattern in $patterns) {
  $source = Join-Path $resolvedDataDir $pattern
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination $targetDir
  }
}

Write-Output "Backup written to $targetDir"
