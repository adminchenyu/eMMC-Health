param(
	[string]$Version = "1.1.3",
	[string]$Release = "1",
	[switch]$WithMmcUtilsDep
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Dist = Join-Path $Root "dist"
$Tmp = Join-Path $Root ".ipk-build"
$PkgName = "luci-app-emmc-health"
$PkgVersion = "$Version-r$Release"
$Ipk = Join-Path $Dist "$PkgName`_$PkgVersion`_all.ipk"

function Remove-Tree($Path) {
	if (Test-Path $Path) {
		Remove-Item -LiteralPath $Path -Recurse -Force
	}
}

function New-Utf8File($Path, $Content) {
	$Dir = Split-Path -Parent $Path
	if (!(Test-Path $Dir)) {
		New-Item -ItemType Directory -Force -Path $Dir | Out-Null
	}
	$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
	$LfContent = $Content -replace "`r`n", "`n"
	$LfContent = $LfContent -replace "`r", "`n"
	[System.IO.File]::WriteAllText($Path, $LfContent, $Utf8NoBom)
}

function Copy-NormalizedTree($Source, $Destination) {
	Get-ChildItem -LiteralPath $Source -Recurse -Force | ForEach-Object {
		$Relative = $_.FullName.Substring($Source.Length).TrimStart('\')
		$Target = Join-Path $Destination $Relative
		if ($_.PSIsContainer) {
			New-Item -ItemType Directory -Force -Path $Target | Out-Null
			return
		}

		$Dir = Split-Path -Parent $Target
		if (!(Test-Path $Dir)) {
			New-Item -ItemType Directory -Force -Path $Dir | Out-Null
		}

		$Normalize = @('.js', '.json', '.sh', '.py') -contains $_.Extension.ToLower() -or $_.Name -in @('emmc-health', 'Makefile')
		if ($Normalize) {
			$Bytes = [System.IO.File]::ReadAllBytes($_.FullName)
			$Text = [System.Text.Encoding]::UTF8.GetString($Bytes) -replace "`r`n", "`n"
			[System.IO.File]::WriteAllText($Target, $Text, (New-Object System.Text.UTF8Encoding($false)))
		}
		else {
			Copy-Item -LiteralPath $_.FullName -Destination $Target -Force
		}
	}
}

Remove-Tree $Tmp
New-Item -ItemType Directory -Force -Path $Dist, $Tmp | Out-Null

$ControlDir = Join-Path $Tmp "control"
$DataDir = Join-Path $Tmp "data"
New-Item -ItemType Directory -Force -Path $ControlDir, $DataDir | Out-Null

Copy-NormalizedTree (Join-Path $Root "root") $DataDir
$WwwDir = Join-Path $DataDir "www"
New-Item -ItemType Directory -Force -Path $WwwDir | Out-Null
Copy-NormalizedTree (Join-Path $Root "htdocs") $WwwDir

$Control = @"
Package: $PkgName
Version: $PkgVersion
Architecture: all
Maintainer: OpenWrt LuCI Community
Section: luci
Priority: optional
Depends: luci-base, rpcd
Description: LuCI support for viewing eMMC EXT_CSD health information.
"@

if ($WithMmcUtilsDep) {
	$Control = $Control -replace "Depends: luci-base, rpcd", "Depends: luci-base, rpcd, mmc-utils"
}

$Postinst = @'
#!/bin/sh

[ -n "$IPKG_INSTROOT" ] && exit 0

chmod 0755 /usr/libexec/emmc-health 2>/dev/null || true

if ! command -v mmc >/dev/null 2>&1 && [ -x /bin/opkg ]; then
	: >/tmp/luci-app-emmc-health-opkg.log
	echo "[luci-app-emmc-health] launcher invoked" >>/tmp/luci-app-emmc-health-opkg.log
	if [ -x /usr/libexec/emmc-health-install-mmc ]; then
		if command -v nohup >/dev/null 2>&1; then
			nohup /usr/libexec/emmc-health-install-mmc >>/tmp/luci-app-emmc-health-opkg.log 2>&1 </dev/null &
		elif command -v setsid >/dev/null 2>&1; then
			setsid /usr/libexec/emmc-health-install-mmc >>/tmp/luci-app-emmc-health-opkg.log 2>&1 </dev/null &
		else
			/usr/libexec/emmc-health-install-mmc >>/tmp/luci-app-emmc-health-opkg.log 2>&1 </dev/null &
		fi
	fi
fi

if [ -x /etc/init.d/rpcd ]; then
	/etc/init.d/rpcd reload 2>/dev/null || /etc/init.d/rpcd restart 2>/dev/null || true
fi

if [ -x /etc/init.d/uhttpd ]; then
	/etc/init.d/uhttpd reload 2>/dev/null || /etc/init.d/uhttpd restart 2>/dev/null || true
fi

exit 0
'@

New-Utf8File (Join-Path $ControlDir "control") ($Control + "`n")
New-Utf8File (Join-Path $ControlDir "postinst") $Postinst
New-Utf8File (Join-Path $ControlDir "conffiles") ""
New-Utf8File (Join-Path $Tmp "debian-binary") "2.0`n"

$ControlTar = Join-Path $Tmp "control.tar.gz"
$DataTar = Join-Path $Tmp "data.tar.gz"
$OuterDir = Join-Path $Tmp "outer"
New-Item -ItemType Directory -Force -Path $OuterDir | Out-Null

Push-Location $ControlDir
try {
	& tar --format=ustar -czf $ControlTar .\control .\postinst .\conffiles
}
finally {
	Pop-Location
}

Push-Location $DataDir
try {
	& tar --format=ustar -czf $DataTar .
}
finally {
	Pop-Location
}

Copy-Item -LiteralPath $ControlTar -Destination (Join-Path $OuterDir "control.tar.gz")
Copy-Item -LiteralPath $DataTar -Destination (Join-Path $OuterDir "data.tar.gz")
New-Utf8File (Join-Path $OuterDir "debian-binary") "2.0`n"

chmod 0755 (Join-Path $DataDir "usr\libexec\emmc-health") 2>$null
chmod 0755 (Join-Path $DataDir "usr\libexec\emmc-health-install-mmc") 2>$null

if (Test-Path $Ipk) {
	Remove-Item -LiteralPath $Ipk -Force
}

Push-Location $OuterDir
try {
	& tar --format=gnu -czf $Ipk .\debian-binary .\data.tar.gz .\control.tar.gz
}
finally {
	Pop-Location
}

Write-Host $Ipk
