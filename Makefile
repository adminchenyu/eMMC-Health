# SPDX-License-Identifier: GPL-3.0-only
#
# Copyright (C) 2026 chenyu

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-emmc-health
PKG_VERSION:=1.1.2
PKG_RELEASE:=1
PKG_LICENSE:=GPL-3.0-only
PKG_MAINTAINER:=chenyu

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-emmc-health
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=eMMC Health
  DEPENDS:=+luci-base +luci-js-deps +rpcd
  PKGARCH:=all
endef

define Package/luci-app-emmc-health/description
 A LuCI app for monitoring eMMC health, capacity, vendor information,
 EXT_CSD life time estimation and Pre EOL status.
endef

define Build/Compile
endef

define Package/luci-app-emmc-health/conffiles
endef

define Package/luci-app-emmc-health/install
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./root/usr/libexec/emmc-health $(1)/usr/libexec/emmc-health
	$(INSTALL_BIN) ./root/usr/libexec/emmc-health-install-mmc $(1)/usr/libexec/emmc-health-install-mmc
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-emmc-health.json $(1)/usr/share/luci/menu.d/luci-app-emmc-health.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-emmc-health.json $(1)/usr/share/rpcd/acl.d/luci-app-emmc-health.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/emmc-health.js $(1)/www/luci-static/resources/view/emmc-health.js
endef

$(eval $(call BuildPackage,luci-app-emmc-health))
