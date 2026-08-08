param(
  [Parameter(Mandatory = $true)]
  [string]$AppKey,

  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [string]$ExecutableName,

  [Parameter(Mandatory = $true)]
  [string]$ShortcutName
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
  throw "Windows installer was not produced: $InstallerPath"
}
if (-not $env:GITHUB_SHA -or $env:GITHUB_SHA -notmatch "^[0-9a-fA-F]{40}$") {
  throw "GITHUB_SHA is required for artifact provenance verification"
}

$programsRoot = Join-Path $env:LOCALAPPDATA "Programs"
$before = @(
  Get-ChildItem $programsRoot -Filter $ExecutableName -File -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object FullName
)
$installed = $null

try {
  $installProcess = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -PassThru -Wait
  if ($installProcess.ExitCode -ne 0) {
    throw "$AppKey installer exited with code $($installProcess.ExitCode)"
  }

  $installed = @(
    Get-ChildItem $programsRoot -Filter $ExecutableName -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $before -notcontains $_.FullName } |
      Select-Object -First 1
  )
  if ($installed.Count -ne 1) {
    throw "Installed $AppKey executable $ExecutableName was not found under $programsRoot"
  }

  $desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "$ShortcutName.lnk"
  $startMenuShortcut = Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" `
    -Filter "$ShortcutName.lnk" -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1
  if (-not (Test-Path -LiteralPath $desktopShortcut -PathType Leaf)) {
    throw "$AppKey desktop shortcut was not created"
  }
  if (-not $startMenuShortcut) {
    throw "$AppKey Start menu shortcut was not created"
  }

  $shell = New-Object -ComObject WScript.Shell
  $installedTarget = (Resolve-Path -LiteralPath $installed[0].FullName).Path
  $desktopTarget = $shell.CreateShortcut($desktopShortcut).TargetPath
  $startMenuTarget = $shell.CreateShortcut($startMenuShortcut.FullName).TargetPath
  if ((Resolve-Path -LiteralPath $desktopTarget).Path -ne $installedTarget) {
    throw "$AppKey desktop shortcut does not target the installed executable"
  }
  if ((Resolve-Path -LiteralPath $startMenuTarget).Path -ne $installedTarget) {
    throw "$AppKey Start menu shortcut does not target the installed executable"
  }

  $env:PASTA_DESKTOP_APP = $AppKey
  $env:PASTA_DESKTOP_EXECUTABLE = $installed[0].FullName
  $env:PASTA_DESKTOP_EXPECTED_TARGET = "win32/x64/nsis"
  $env:PASTA_DESKTOP_EXPECTED_GIT_SHA = $env:GITHUB_SHA
  npm run pasta:desktop:artifact-smoke
  if ($LASTEXITCODE -ne 0) {
    throw "$AppKey packaged-artifact smoke exited with code $LASTEXITCODE"
  }
}
finally {
  if ($installed -and $installed.Count -eq 1) {
    $uninstaller = Get-ChildItem $installed[0].DirectoryName -Filter "Uninstall*.exe" -File |
      Select-Object -First 1
    if (-not $uninstaller) {
      throw "$AppKey uninstaller was not installed"
    }
    $uninstallProcess = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -PassThru -Wait
    if ($uninstallProcess.ExitCode -ne 0) {
      throw "$AppKey uninstaller exited with code $($uninstallProcess.ExitCode)"
    }
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $installed[0].FullName) {
      throw "$AppKey executable remained after uninstall"
    }
  }
}
