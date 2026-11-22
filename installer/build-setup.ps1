$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$csPath = Join-Path $PSScriptRoot 'FoolmoonSetup.cs'
$bootstrapPath = Join-Path $PSScriptRoot 'bootstrap-foolmoon.ps1'
$iconPath = Join-Path $repoRoot 'apps\desktop\assets\icon.ico'
$distDir = Join-Path $PSScriptRoot 'dist'
$outExe = Join-Path $distDir 'Foolmoon-Setup.exe'
$sumFile = Join-Path $distDir 'SHA256SUMS.txt'

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) {
    throw "Microsoft .NET Framework csc.exe not found at $csc"
}

$wpfDir = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF'
$fxDir = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

$cscArgs = @(
    '/nologo'
    '/optimize+'
    '/target:winexe'
    '/platform:anycpu'
    "/out:$outExe"
    "/resource:$bootstrapPath,bootstrap-foolmoon.ps1"
    "/r:$wpfDir\PresentationFramework.dll"
    "/r:$wpfDir\PresentationCore.dll"
    "/r:$wpfDir\WindowsBase.dll"
    "/r:$fxDir\System.Xaml.dll"
    "/r:$fxDir\System.Web.Extensions.dll"
    "/r:$fxDir\System.Windows.Forms.dll"
    "/r:$fxDir\System.Net.Http.dll"
)

if (Test-Path -LiteralPath $iconPath) {
    $cscArgs += "/win32icon:$iconPath"
}

$cscArgs += $csPath

Write-Host "Compiling Foolmoon-Setup.exe..." -ForegroundColor Cyan
& $csc @cscArgs
if ($LASTEXITCODE -ne 0) {
    throw "csc.exe compilation failed with exit code $LASTEXITCODE"
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $outExe).Hash.ToLowerInvariant()
$sumLine = "$hash *Foolmoon-Setup.exe`n"
[System.IO.File]::WriteAllText($sumFile, $sumLine, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Built: $outExe ($hash)" -ForegroundColor Green
