#!/bin/sh

set -eu

PKG_NAME="luci-app-emmc-health"
VERSION="${1:-1.0.6}"
RELEASE="${2:-1}"
PKG_VERSION="${VERSION}-r${RELEASE}"
WITH_MMC_DEP="${3:-0}"

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/.openwrt-ipk-build"
PKG_DIR="${BUILD_DIR}/${PKG_NAME}"
DIST_DIR="${ROOT_DIR}/dist"

rm -rf "$BUILD_DIR"
mkdir -p "$PKG_DIR/CONTROL" "$DIST_DIR"

cp -a "$ROOT_DIR/root/." "$PKG_DIR/"
mkdir -p "$PKG_DIR/www"
cp -a "$ROOT_DIR/htdocs/." "$PKG_DIR/www/"

cat > "$PKG_DIR/CONTROL/control" <<EOF
Package: ${PKG_NAME}
Version: ${PKG_VERSION}
Architecture: all
Maintainer: OpenWrt LuCI Community
Section: luci
Priority: optional
Depends: luci-base, rpcd
Description: LuCI support for viewing eMMC EXT_CSD health information.
EOF

if [ "$WITH_MMC_DEP" = "1" ]; then
	sed -i 's/^Depends: luci-base, rpcd$/Depends: luci-base, rpcd, mmc-utils/' "$PKG_DIR/CONTROL/control"
fi

cat > "$PKG_DIR/CONTROL/postinst" <<'EOF'
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
EOF

chmod 0755 "$PKG_DIR/CONTROL/postinst"
chmod 0755 "$PKG_DIR/usr/libexec/emmc-health"
chmod 0755 "$PKG_DIR/usr/libexec/emmc-health-install-mmc"

if command -v opkg-build >/dev/null 2>&1; then
	opkg-build "$PKG_DIR" "$DIST_DIR"
elif command -v ipkg-build >/dev/null 2>&1; then
	ipkg-build "$PKG_DIR" "$DIST_DIR"
else
	echo "未找到 opkg-build/ipkg-build。请先安装构建工具，或在 OpenWrt SDK 中编译。" >&2
	exit 1
fi

echo "${DIST_DIR}/${PKG_NAME}_${PKG_VERSION}_all.ipk"
