# 0.1.5 acceptance scope

Reference-inspired in-window navigation with working preferences, account copy/refresh/subscription link, About and help. No fake devices/history/favourites/download pages.
Linux: AppStream identity, package linkage, desktop uninstall action, real-size and homepage metadata, icon variants, discovery-cache refresh. Graphical uninstall uses only fixed dpkg --remove kinosota-player through polkit after explicit confirmation; no shell input, root GUI, install-time user guessing or protection bypass. Portable/source builds cannot remove a system package.
Windows: publisher/icon/website/version identity, installed-app uninstaller, RU/EN setup, default-enabled launch on interactive setup finish; silent CI install does not launch. Identity is not code signing.
macOS: bundle display/version identity, Applications drag target and installation/removal instructions. DMG copy does not offer a reliable post-install trigger; no privileged scripts or quarantine bypass.
Linux software centers differ. AppStream inclusion improves identity but does not guarantee every App Center indexes sideloaded .deb files. Settings/About offers graphical removal independently. Signed APT/store publishing needs a separately trusted distribution channel; unsigned preview warnings cannot be hidden honestly.
Browsers cannot force-open a downloaded executable. Download UI must show actual transfer progress/integrity outcome and next steps, never claim OS installation occurred.
