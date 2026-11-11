param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot '../dist' }
& (Join-Path $PSScriptRoot '../chrome-reels-extension/package.ps1') -OutputDirectory $OutputDirectory
