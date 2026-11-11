$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    & $node.Source -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
    if ($LASTEXITCODE -eq 0) { & $node.Source scripts/launch.mjs; exit $LASTEXITCODE }
  }
  if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Only Windows x64 is supported by this bootstrap.' }
  $name = 'node-v24.22.2-win-x64'
  $base = Join-Path (Get-Location) '.launcher/runtime'
  $exe = Join-Path $base "$name/node.exe"
  if (!(Test-Path $exe)) {
    $work = Join-Path $base ([guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Force $work | Out-Null
    try {
      $zip = Join-Path $work "$name.zip"
      Write-Host 'Preparing a private Node runtime. Internet access is required.'
      Invoke-WebRequest "https://nodejs.org/dist/v24.22.2/$name.zip" -OutFile $zip -TimeoutSec 600 -UseBasicParsing
      $expected = ((Get-Content scripts/runtime-checksums.txt | Where-Object { $_ -match "  $name.zip$" }) -split '\s+')[0]
      if (!$expected -or (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $expected) { throw 'Runtime checksum mismatch. Nothing will be executed.' }
      Expand-Archive $zip -DestinationPath $work
      if (!(Test-Path (Join-Path $base $name))) { Move-Item (Join-Path $work $name) $base }
    } finally { Remove-Item $work -Recurse -Force }
  }
  $env:PATH = "$(Split-Path $exe);$env:PATH"
  & $exe scripts/launch.mjs
  exit $LASTEXITCODE
} catch { Write-Host "Startup failed: $($_.Exception.Message)"; exit 1 }
