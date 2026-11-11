param([string]$TaskName = 'LocalAgentRemote', [switch]$Remove)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot '../local-workflow-agent/scripts/install-remote-startup.ps1') -TaskName $TaskName -Remove:$Remove
