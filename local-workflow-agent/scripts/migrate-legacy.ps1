$ErrorActionPreference = 'Stop'
$appDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$legacyRoot = [IO.Path]::GetFullPath((Join-Path $appDir '..'))
if (!(Test-Path -LiteralPath (Join-Path $legacyRoot 'local-agent.js'))) { throw 'No legacy checkout found beside this app.' }
# Do not move files underneath a running default/configured agent.
$port = 34719
$envFile = Join-Path $appDir '.env'
if (!(Test-Path -LiteralPath $envFile)) { $envFile = Join-Path $legacyRoot '.env' }
if (Test-Path -LiteralPath $envFile) {
    foreach ($line in [IO.File]::ReadAllLines($envFile)) {
        if ($line -match '^\s*LOCAL_AGENT_PORT\s*=\s*["'']?(\d+)["'']?\s*(?:#.*)?$') { $port = [int]$Matches[1] }
    }
}
if ($env:LOCAL_AGENT_PORT) { $port = [int]$env:LOCAL_AGENT_PORT }
$client = New-Object Net.Sockets.TcpClient
try {
    $connection = $client.ConnectAsync('127.0.0.1', $port)
    try { $connected = $connection.Wait(1000) -and $client.Connected } catch { $connected = $false }
    if ($connected) { throw 'Stop the local agent before migrating its files.' }
} finally { $client.Dispose() }
$moves = @()
foreach ($pair in @(@('.env', '.env'), @('tools', 'tools'), @('data/agent', 'data'))) {
    $source = Join-Path $legacyRoot $pair[0]
    if (Test-Path -LiteralPath $source) { $moves += @{ Source = $source; Destination = (Join-Path $appDir $pair[1]) } }
}
$scenarios = Join-Path $legacyRoot 'scenarios'
if (Test-Path -LiteralPath $scenarios) {
    foreach ($file in Get-ChildItem -LiteralPath $scenarios -File) {
        $moves += @{ Source = $file.FullName; Destination = (Join-Path $appDir ('scenarios/' + $file.Name)) }
    }
}
# Preflight every path/collision before the first mutation. No overwrites/deletes.
foreach ($move in $moves) {
    $move.Source = [IO.Path]::GetFullPath($move.Source)
    $move.Destination = [IO.Path]::GetFullPath($move.Destination)
    if (!$move.Source.StartsWith($legacyRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        !$move.Destination.StartsWith($appDir + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Migration path escapes the expected checkout.' }
    if ((Get-Item -LiteralPath $move.Source).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Migration does not move linked paths.' }
    if (Test-Path -LiteralPath $move.Destination) { throw ('Migration destination exists; resolve it before retrying: ' + $move.Destination) }
}
foreach ($move in $moves) {
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($move.Destination)) | Out-Null
    Move-Item -LiteralPath $move.Source -Destination $move.Destination
}
if (Test-Path -LiteralPath $scenarios) {
    if (@(Get-ChildItem -LiteralPath $scenarios -Force).Count -eq 0) { Remove-Item -LiteralPath $scenarios }
}
Write-Output ('Migrated ' + $moves.Count + ' paths. Start the agent from local-workflow-agent/.')
