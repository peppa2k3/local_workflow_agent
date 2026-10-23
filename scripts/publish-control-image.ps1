param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_.-]*$')][string]$Repository,
  [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$')][string]$Tag,
  [ValidateSet('linux/amd64', 'linux/arm64', 'linux/amd64,linux/arm64')][string]$Platforms = 'linux/amd64',
  [switch]$Push
)
$ErrorActionPreference = 'Stop'
if (!$Push -and $Platforms.Contains(',')) { throw 'Multi-platform builds require -Push. Use one platform for a local build.' }
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$revision = & git -C $projectDir rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve git revision' }
$imageName = $Repository + ':' + $Tag
$dockerArgs = @('buildx', 'build', '--file', (Join-Path $projectDir 'deploy/control/Dockerfile'), '--platform', $Platforms, '--tag', $imageName,
  '--build-arg', ('VERSION=' + $Tag), '--build-arg', ('REVISION=' + $revision.Trim()))
if ($Push) { $dockerArgs += '--push' } else { $dockerArgs += '--load' }
$dockerArgs += $projectDir
& docker @dockerArgs
if ($LASTEXITCODE -ne 0) { throw 'Docker build/publish failed. Check Docker Engine, buildx and docker login.' }
Write-Output $(if ($Push) { "Published $imageName" } else { "Built locally: $imageName. Use -Push after docker login to publish." })
