#!/usr/bin/env python3
import gzip
import io
import os
import shutil
import sys
import tarfile
from pathlib import Path

PKG_NAME = "luci-app-emmc-health"
VERSION = "1.1.3"
ARCH = sys.argv[1] if len(sys.argv) > 1 else "all"
WITHOUT_MMC_DEP = "--without-mmc-utils" in sys.argv[2:]
RELEASE = "1"
PKG_VERSION = f"{VERSION}-r{RELEASE}"

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
TMP = ROOT / ".py-ipk-build"
OUT = DIST / f"{PKG_NAME}_{PKG_VERSION}_{ARCH}.ipk"

CONTROL = f"""Package: {PKG_NAME}
Version: {PKG_VERSION}
Architecture: {ARCH}
Maintainer: OpenWrt LuCI Community
Section: luci
Priority: optional
Depends: luci-base, rpcd
Description: LuCI support for viewing eMMC EXT_CSD health information.
"""

if "--with-mmc-utils-dep" in sys.argv[2:] and not WITHOUT_MMC_DEP:
	CONTROL = CONTROL.replace(
		"Depends: luci-base, rpcd\n",
		"Depends: luci-base, rpcd, mmc-utils\n",
	)

POSTINST = """#!/bin/sh

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
\t/etc/init.d/rpcd reload 2>/dev/null || /etc/init.d/rpcd restart 2>/dev/null || true
fi

if [ -x /etc/init.d/uhttpd ]; then
\t/etc/init.d/uhttpd reload 2>/dev/null || /etc/init.d/uhttpd restart 2>/dev/null || true
fi

exit 0
"""


def add_bytes(tar: tarfile.TarFile, name: str, data: bytes, mode: int) -> None:
	info = tarfile.TarInfo(name)
	info.size = len(data)
	info.mode = mode
	info.uid = 0
	info.gid = 0
	info.uname = "root"
	info.gname = "root"
	info.mtime = 0
	tar.addfile(info, io.BytesIO(data))


def add_dir(tar: tarfile.TarFile, name: str) -> None:
	info = tarfile.TarInfo(name.rstrip("/") + "/")
	info.type = tarfile.DIRTYPE
	info.mode = 0o755
	info.uid = 0
	info.gid = 0
	info.uname = "root"
	info.gname = "root"
	info.mtime = 0
	tar.addfile(info)


def tar_gz_bytes(entries) -> bytes:
	raw = io.BytesIO()
	with tarfile.open(fileobj=raw, mode="w", format=tarfile.USTAR_FORMAT) as tar:
		for entry in entries:
			kind = entry[0]
			if kind == "dir":
				add_dir(tar, entry[1])
			else:
				_, name, data, mode = entry
				add_bytes(tar, name, data, mode)

	compressed = io.BytesIO()
	with gzip.GzipFile(filename="", mode="wb", fileobj=compressed, mtime=0) as gz:
		gz.write(raw.getvalue())
	return compressed.getvalue()


def normalize_package_bytes(path: Path, data: bytes) -> bytes:
	# OpenWrt shell scripts must use LF line endings or /bin/sh is resolved as
	# "/bin/sh\r", which surfaces as "resource not found" during exec().
	if path.suffix.lower() in (".js", ".json", ".sh", ".py") or path.name in ("emmc-health", "Makefile"):
		return data.replace(b"\r\n", b"\n")
	return data


def collect_data_entries():
	entries = []
	seen_dirs = set()

	def ensure_dir(name: str):
		name = name.replace("\\", "/").strip("/")
		while name.startswith("./"):
			name = name[2:]
		if not name or name == ".":
			return
		parts = name.split("/")
		current = "."
		for part in parts:
			current = f"{current}/{part}"
			if current not in seen_dirs:
				entries.append(("dir", current))
				seen_dirs.add(current)

	def add_tree(source: Path, target_prefix: str):
		for path in sorted(source.rglob("*")):
			rel = path.relative_to(source).as_posix()
			target = f"{target_prefix.rstrip('/')}/{rel}".replace("//", "/")
			parent = os.path.dirname(target)
			ensure_dir(parent)
			if path.is_dir():
				ensure_dir(target)
			else:
				mode = 0o755 if target in ("./usr/libexec/emmc-health", "./usr/libexec/emmc-health-install-mmc") else 0o644
				entries.append(("file", target, normalize_package_bytes(path, path.read_bytes()), mode))

	entries.append(("dir", "."))
	seen_dirs.add(".")
	add_tree(ROOT / "root", ".")
	add_tree(ROOT / "htdocs", "./www")
	return entries


def main():
	if TMP.exists():
		shutil.rmtree(TMP)
	DIST.mkdir(exist_ok=True)

	control_tar = tar_gz_bytes([
		("file", "./control", CONTROL.encode("utf-8"), 0o644),
		("file", "./postinst", POSTINST.encode("utf-8"), 0o755),
		("file", "./conffiles", b"", 0o644),
	])
	data_tar = tar_gz_bytes(collect_data_entries())

	with OUT.open("wb") as f:
		with gzip.GzipFile(filename="", mode="wb", fileobj=f, mtime=0) as gz:
			with tarfile.open(fileobj=gz, mode="w", format=tarfile.GNU_FORMAT) as tar:
				add_bytes(tar, "./debian-binary", b"2.0\n", 0o644)
				add_bytes(tar, "./data.tar.gz", data_tar, 0o644)
				add_bytes(tar, "./control.tar.gz", control_tar, 0o644)

	print(OUT)


if __name__ == "__main__":
	main()
