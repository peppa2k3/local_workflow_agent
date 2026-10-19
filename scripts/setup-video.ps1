$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$destination = Join-Path (Split-Path $PSScriptRoot -Parent) 'tools'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Invoke-WebRequest -UseBasicParsing 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile (Join-Path $destination 'yt-dlp.exe')
$archive = Join-Path $destination 'ffmpeg.zip'
$release = Invoke-RestMethod 'https://api.github.com/repos/GyanD/codexffmpeg/releases/latest'
$asset = $release.assets | Where-Object name -Match 'essentials_build.zip$' | Select-Object -First 1
if (!$asset) { throw 'FFmpeg essentials zip missing from Gyan release' }
Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $archive
$extracted = Join-Path $destination ('package-' + $release.tag_name)
Expand-Archive -LiteralPath $archive -DestinationPath $extracted -Force
$ffmpeg = Get-ChildItem -LiteralPath $extracted -Recurse -Filter ffmpeg.exe | Select-Object -First 1
if (!$ffmpeg) { throw 'ffmpeg.exe missing from archive' }
Copy-Item -LiteralPath $ffmpeg.FullName -Destination (Join-Path $destination 'ffmpeg.exe') -Force
$ffprobe = Join-Path $ffmpeg.DirectoryName 'ffprobe.exe'
Copy-Item -LiteralPath $ffprobe -Destination (Join-Path $destination 'ffprobe.exe') -Force
& (Join-Path $destination 'yt-dlp.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'yt-dlp verification failed' }
& (Join-Path $destination 'ffmpeg.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg verification failed' }
