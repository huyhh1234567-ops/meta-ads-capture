param([string]$GoogleExecUrl = '', [string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
if ($GoogleExecUrl -notmatch '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$') {
  throw 'Cần URL /exec của deployment chạy bằng User accessing the web app. Không tạo gói khi thiếu deployment.'
}
$packageRoot = Split-Path -Parent $PSScriptRoot
$packageManifest = Get-Content -Raw -LiteralPath (Join-Path $packageRoot 'manifest.json') | ConvertFrom-Json
$packageParent = Join-Path $packageRoot ('output/package-' + [Guid]::NewGuid().ToString('N'))
$packageStage = Join-Path $packageParent 'meta-ads-capture'
New-Item -ItemType Directory -Path $packageStage -Force | Out-Null
$runtimeFiles = @('manifest.json','background.js','google-drive-service.js','google-drive-bridge.js','capture-scroll.js','content.js','google-content.js','page-content.js','xlsx-parser.js','offscreen.js','offscreen.html','popup.js','popup.html','popup.css','progress.js','progress.html','progress.css')
foreach ($runtimeFile in $runtimeFiles) {
  Copy-Item -LiteralPath (Join-Path $packageRoot $runtimeFile) -Destination (Join-Path $packageStage $runtimeFile)
}
Copy-Item -LiteralPath (Join-Path $packageRoot 'assets') -Destination $packageStage -Recurse
Copy-Item -LiteralPath (Join-Path $packageRoot 'PACKAGE-README.md') -Destination (Join-Path $packageStage 'README.md')
$publicConfig = @{ googleExecUrl = $GoogleExecUrl } | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $packageStage 'package-config.js'), ('globalThis.MAC_DRIVE_PACKAGE = Object.freeze(' + $publicConfig + ');'), [Text.UTF8Encoding]::new($false))
$releaseDirectory = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { Join-Path $packageRoot 'output/releases' }
$allowedOutput = [IO.Path]::GetFullPath((Join-Path $packageRoot 'output')) + [IO.Path]::DirectorySeparatorChar
if (-not ($releaseDirectory + [IO.Path]::DirectorySeparatorChar).StartsWith($allowedOutput, [StringComparison]::OrdinalIgnoreCase)) { throw 'Thư mục đóng gói phải nằm trong output của project.' }
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$releasePath = Join-Path $releaseDirectory ('meta-ads-capture-v' + $packageManifest.version + '-google-drive.zip')
Compress-Archive -LiteralPath $packageStage -DestinationPath $releasePath -Force
[pscustomobject]@{ Version = $packageManifest.version; Zip = $releasePath; Bytes = (Get-Item -LiteralPath $releasePath).Length; Deployment = $GoogleExecUrl } | ConvertTo-Json
