param([string]$TaskName = 'LocalAgentRemote', [switch]$Remove)
$ErrorActionPreference = 'Stop'
if ($Remove) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false; exit 0 }
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runnerPath = Join-Path $projectDir 'scripts\run-local-agent.ps1'
if (!(Test-Path -LiteralPath $runnerPath -PathType Leaf)) { throw 'Runner not found' }
Get-Command node.exe -ErrorAction Stop | Out-Null
$accountName = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$action = New-ScheduledTaskAction -Execute $powershellPath -Argument ('-NoProfile -WindowStyle Hidden -File "' + $runnerPath + '"') -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $accountName
$principal = New-ScheduledTaskPrincipal -UserId $accountName -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
# Registration does not start an agent or interact with the existing Chrome profile.
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Outbound remote scenario agent; requires the signed-in Chrome session' | Out-Null
Write-Output "Registered $TaskName for $accountName at next sign-in. Use Start-ScheduledTask after closing any foreground agent."
