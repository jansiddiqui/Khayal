<#
.SYNOPSIS
  ONLY FOR DATABASES REACHABLE FROM OUTSIDE, WITH A MATCHING pg_dump VERSION.
  Back up a Khayal Postgres database to data\backups\voroa\khayal-YYYY-MM-DD.dump.

.DESCRIPTION
  This does NOT work with the current Voroa database: it is reachable only from apps inside the
  Voroa workspace and runs PostgreSQL 18, while the portable tools in data\pgsql are version 17.
  For Voroa, download the weekly backup from the dashboard (khayal-db -> Backups) and save it
  under data\backups\voroa\; see docs/BACKUP-RESTORE.md.

  Uses the portable pg_dump in data\pgsql (gitignored; see docs/BACKUP-RESTORE.md). The database
  address is read from an environment variable and never stored in the repository:
    $env:KHAYAL_BACKUP_DATABASE_URL  (preferred), or  $env:DATABASE_URL
  Keeps the newest 8 dumps (about two months of weekly backups) and prints the size.
  Run it once a week. Restore steps: docs/BACKUP-RESTORE.md.

.EXAMPLE
  $env:KHAYAL_BACKUP_DATABASE_URL = "postgres://USER:PASS@HOST:PORT/DB?sslmode=require"
  powershell -ExecutionPolicy Bypass -File scripts\backup-voroa.ps1
#>
param(
  # Where the dumps go (default: data\backups\voroa in this repository).
  [string]$OutDir = "",
  # How many dumps to keep.
  [int]$Keep = 8
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$pgDump = Join-Path $repo "data\pgsql\bin\pg_dump.exe"
if (-not (Test-Path -LiteralPath $pgDump)) {
  Write-Error "pg_dump not found at $pgDump. Unpack the portable PostgreSQL binaries into data\pgsql first (docs/BACKUP-RESTORE.md)."
  exit 1
}

$url = $env:KHAYAL_BACKUP_DATABASE_URL
if (-not $url) { $url = $env:DATABASE_URL }
if (-not $url) {
  Write-Error 'Set the database address first, for this window only:  $env:KHAYAL_BACKUP_DATABASE_URL = "postgres://..."  (copy it from the Voroa dashboard; never save it in the repository).'
  exit 1
}

if (-not $OutDir) { $OutDir = Join-Path $repo "data\backups\voroa" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path
$file = Join-Path $OutDir ("khayal-" + (Get-Date -Format "yyyy-MM-dd") + ".dump")

Write-Host "Backing up to $file ..."
# Custom format: compressed, and pg_restore can restore all of it or single tables.
& $pgDump --format=custom --no-owner --no-privileges --file "$file" --dbname "$url"
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed (exit code $LASTEXITCODE). Nothing was deleted."
  exit $LASTEXITCODE
}
$size = (Get-Item -LiteralPath $file).Length
Write-Host ("Done: {0} ({1:N1} MB)" -f (Split-Path -Leaf $file), ($size / 1MB))

# Keep the newest $Keep dumps. Delete older ones one file at a time, only khayal-*.dump in this folder.
$dumps = @(Get-ChildItem -LiteralPath $OutDir -File -Filter "khayal-*.dump" | Sort-Object Name -Descending)
foreach ($old in ($dumps | Select-Object -Skip $Keep)) {
  if ($old.DirectoryName -ne $OutDir -or $old.Name -notmatch '^khayal-\d{4}-\d{2}-\d{2}\.dump$') { continue }
  Write-Host "Removing old backup $($old.Name)"
  Remove-Item -LiteralPath $old.FullName
}
$left = @(Get-ChildItem -LiteralPath $OutDir -File -Filter "khayal-*.dump").Count
Write-Host "$left backup(s) kept in $OutDir"
