param(
  [Parameter(Mandatory=$true)][string]$Repository,
  [Parameter(Mandatory=$true)][string]$Tag,
  [string]$Platforms = 'linux/amd64',
  [switch]$Push
)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot '../control-server/scripts/publish-image.ps1') -Repository $Repository -Tag $Tag -Platforms $Platforms -Push:$Push
