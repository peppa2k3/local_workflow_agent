param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$extensionDir = $PSScriptRoot
if (!$OutputDirectory) { $OutputDirectory = Join-Path $extensionDir 'dist' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$manifest = Get-Content -LiteralPath (Join-Path $extensionDir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.manifest_version -ne 3 -or $manifest.version -notmatch '^\d+(\.\d+){0,3}$') { throw 'Invalid extension manifest/version' }
# Explicit release contents: files outside this list never enter the upload ZIP.
$files = @('manifest.json', 'background.js', 'content.js', 'options.html', 'options.js')
$references = @($manifest.background.service_worker, $manifest.options_page)
foreach ($script in $manifest.content_scripts) { $references += $script.js }
foreach ($reference in $references) {
    if ($reference -and $reference -notin $files) { throw "Add manifest resource to release files: $reference" }
}
foreach ($file in $files) {
    if (!(Test-Path -LiteralPath (Join-Path $extensionDir $file) -PathType Leaf)) { throw "Missing extension file: $file" }
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$archivePath = Join-Path $OutputDirectory ('chrome-reels-extension-' + $manifest.version + '.zip')
if (Test-Path -LiteralPath $archivePath) { throw "Archive exists; choose another output directory or remove it first: $archivePath" }
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $extensionDir $file), $file, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
Write-Output "Extension ZIP: $archivePath"
