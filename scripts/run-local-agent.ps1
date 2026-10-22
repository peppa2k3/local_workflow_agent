$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$entryPath = Join-Path $projectDir 'local-agent.js'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$logDir = Join-Path $projectDir 'data\daemon-logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
# Separate logs per launch; stderr stays diagnostic and does not terminate PowerShell.
$logStamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss-fff'
$outputLog = Join-Path $logDir ($logStamp + '.stdout.log')
$errorLog = Join-Path $logDir ($logStamp + '.stderr.log')
$agentProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $entryPath + '"'), '--daemon') -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -Wait -PassThru
exit $agentProcess.ExitCode
