# Aphrody Box installation on Windows (Docker Desktop): same flow as installer.sh.
#   powershell -c "irm https://raw.githubusercontent.com/aphrody-labs/auto/main/box/installer.ps1 | iex"
# Options: $env:BOX_DOSSIER (default ~\aphrody-box), $env:BOX_EMAIL, $env:BOX_DOMAINE.
$ErrorActionPreference = 'Stop'

function Say($t) { Write-Host $t -ForegroundColor Cyan }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop is required: https://www.docker.com/products/docker-desktop/" }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker is not responding: start Docker Desktop then run this script again." }

$dossier = if ($env:BOX_DOSSIER) { $env:BOX_DOSSIER } else { Join-Path $HOME 'aphrody-box' }
if ((Test-Path .\compose.yaml) -and (Select-String -Quiet -Path .\compose.yaml -Pattern 'name: aphrody-box')) { $dossier = (Get-Location).Path }
New-Item -ItemType Directory -Force $dossier | Out-Null
Set-Location $dossier

if (-not (Test-Path compose.yaml) -or $env:BOX_MAJ -eq '1') {
    Say "Downloading the box into $dossier…"
  $archive = Join-Path $env:TEMP 'aphrody-box.tar.gz'
  Invoke-WebRequest https://codeload.github.com/aphrody-labs/auto/tar.gz/refs/heads/main -OutFile $archive
  tar -xzf $archive --strip-components=2 auto-main/box
  Remove-Item $archive
}

$image = if ($env:BOX_IMAGE_CONSOLE) { $env:BOX_IMAGE_CONSOLE } else { 'ghcr.io/aphrody-labs/aphrody-box:latest' }
docker pull -q $image *> $null
if ($LASTEXITCODE -ne 0) {
    Say "Console image not found online: building on this machine (a few minutes)…"
  docker build -q -t $image console | Out-Null
}

$gpu = '--sans-gpu'
if ((Get-Command nvidia-smi -ErrorAction SilentlyContinue) -and ((docker info 2>$null) -match 'nvidia')) { $gpu = '--gpu' }
$hote = if ($env:BOX_HOTE) { $env:BOX_HOTE } else {
  (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.PrefixOrigin -in 'Dhcp', 'Manual' -and $_.IPAddress -notlike '169.254*' } |
    Select-Object -First 1).IPAddress
}
if (-not $hote) { $hote = 'localhost' }

$args_ = @('preparer', '/box', $gpu, '--hote', $hote)
if ($env:BOX_EMAIL) { $args_ += @('--email', $env:BOX_EMAIL) }
if ($env:BOX_DOMAINE) { $args_ += @('--domaine', $env:BOX_DOMAINE) }
docker run --rm -v "${dossier}:/box" $image @args_
if ($LASTEXITCODE -ne 0) { throw "preparation failed" }

Say "Starting the services (the first launch downloads the images and a 2.5 GB AI model)…"
docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { throw "startup failed: docker compose logs" }

$mdp = (Select-String -Path .env -Pattern "^BOX_ADMIN_MOT_DE_PASSE='(.*)'$").Matches[0].Groups[1].Value
$url = if ($env:BOX_DOMAINE) { "https://console.$($env:BOX_DOMAINE)" } else { "http://${hote}:8080" }
Write-Host ""
Say "The Aphrody Box is running."
Write-Host "  Console: $url"
Write-Host "  Username: admin"
Write-Host "  Password: $mdp"
Write-Host "The access details of Auto, n8n, Hermes and Obsidian are in the console, 'Access' section."
