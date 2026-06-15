# Builds the WordPress.org submission zip for Nexora Pulse.
#
# IMPORTANT: do NOT use Compress-Archive for this. It writes zip entries with
# backslash separators (nexora-pulse\app\...), which WordPress's extractor on
# Linux treats as flat filenames — the plugin folder structure is lost and
# activation fails with "Plugin file does not exist."
#
# Windows 10+ ships bsdtar (tar.exe), which produces standard forward-slash
# zip entries. This script stages the release files and zips with tar.
#
# Usage:  .\build-zip.ps1   (run from the plugin folder)

$ErrorActionPreference = 'Stop'

# Layout: <root>\products\nexora-pulse\  ->  release lives at <root>\release\
$src      = $PSScriptRoot
$root     = Split-Path (Split-Path $src -Parent) -Parent
$relProd  = Join-Path (Join-Path $root 'release') 'nexora-pulse'
$stage    = Join-Path $relProd 'nexora-pulse'
$zipName  = 'nexora-pulse-1.0.0.zip'
$zipPath  = Join-Path $relProd $zipName

# Fresh stage.
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

# Production runtime files only. node_modules, frontend source, and dev
# tooling config are never shipped.
robocopy "$src\app"    "$stage\app"    /E /NFL /NDL /NJH /NJS | Out-Null
robocopy "$src\assets" "$stage\assets" /E /NFL /NDL /NJH /NJS | Out-Null

$rootFiles = @(
    'nexora-pulse.php', 'readme.txt', 'uninstall.php', 'index.php'
)
foreach ($f in $rootFiles) {
    Copy-Item (Join-Path $src $f) $stage -Force
}

# Zip with bsdtar from inside the release dir so the archive root is the
# nexora-pulse/ folder with forward-slash entry paths.
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Push-Location $relProd
try {
    & tar.exe -a -cf $zipName 'nexora-pulse'
    if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

# Sanity check: entries must use forward slashes and the main file must sit
# directly under nexora-pulse/.
$entries = & tar.exe -tf $zipPath
if ($entries -match '\\') {
    throw 'Zip contains backslash entry paths — do not ship this archive.'
}
if (-not ($entries -contains 'nexora-pulse/nexora-pulse.php')) {
    throw 'nexora-pulse/nexora-pulse.php missing from archive root.'
}

Write-Output "OK: $zipPath"
Write-Output ("Entries: " + ($entries | Measure-Object).Count)
