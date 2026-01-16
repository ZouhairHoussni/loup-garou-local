param(
  [int]$Count = 6,
  [switch]$Bot,
  [string]$UrlBase = "http://127.0.0.1:8000/player/",
  [switch]$AppMode,
  [switch]$IsolateProfiles,
  # Portrait 9:16 (exact)
  [int]$Width = 432,
  [int]$Height = 768,
  [int]$StartX = 20,
  [int]$StartY = 20,
  [int]$DX = 40,
  [int]$DY = 20
)

function Encode-Url([string]$s) {
  return [uri]::EscapeDataString($s)
}

# Find Chrome
$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Chrome not found. Install Google Chrome first." }

# Ensure UrlBase ends with /
if ($UrlBase -notmatch "/$") { $UrlBase = $UrlBase + "/" }

for ($i=1; $i -le $Count; $i++) {
  $name = "p$($i)"
  $q = "name=$(Encode-Url $name)&autojoin=1"
  if ($Bot) { $q += "&bot=1" }

  # Build FULL URL (includes /? )
  $url = "$UrlBase`?$q"

  # Window placement (slight cascade)
  $x = $StartX + ($i-1)*$DX
  $y = $StartY + ($i-1)*$DY

  $args = @()

  # Isolate browser profiles (optional) so each bot is truly separate
  if ($IsolateProfiles) {
    $profileDir = Join-Path $env:TEMP ("loupgarou_profile_" + [guid]::NewGuid().ToString("N"))
    $args += "--user-data-dir=$profileDir"
  }

  # Open a 9:16-ish window (phone shape)
  $args += "--window-size=$Width,$Height"
  $args += "--window-position=$x,$y"
  $args += "--disable-session-crashed-bubble"

  if ($AppMode) {
    # App mode shows a chromeless window; URL must be in the same argument
    $args += "--app=$url"
  } else {
    $args += "--new-window"
    # CRITICAL: pass the URL as ONE argument
    $args += $url
  }

  Start-Process -FilePath $chrome -ArgumentList $args
}

Write-Host "Spawned $Count players. Bot: $Bot. UrlBase: $UrlBase. Size: ${Width}x${Height}. AppMode: $AppMode. IsolateProfiles: $IsolateProfiles"
