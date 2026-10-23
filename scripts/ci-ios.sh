#!/usr/bin/env bash
# Patches the generated iOS project. Runs on Codemagic (macOS) after `npx cap add ios`.
set -euo pipefail
PLIST="ios/App/App/Info.plist"
PBX="ios/App/App.xcodeproj/project.pbxproj"
PB=/usr/libexec/PlistBuddy
setkey(){ $PB -c "Set :$1 $3" "$PLIST" 2>/dev/null || $PB -c "Add :$1 $2 $3" "$PLIST"; }

# No custom encryption: skips the export-compliance question on every upload
setkey ITSAppUsesNonExemptEncryption bool false
# Full-screen game: hide the status bar
setkey UIStatusBarHidden bool true
setkey UIViewControllerBasedStatusBarAppearance bool false
setkey UIRequiresFullScreen bool true
# Modern device capability (template still lists armv7)
$PB -c "Delete :UIRequiredDeviceCapabilities" "$PLIST" 2>/dev/null || true
$PB -c "Add :UIRequiredDeviceCapabilities array" "$PLIST"
$PB -c "Add :UIRequiredDeviceCapabilities:0 string arm64" "$PLIST"
$PB -c "Set :CFBundleDisplayName Chalkline" "$PLIST"

# iPhone only for v1 (iPads still run it in compatibility mode; no iPad screenshots needed)
sed -i '' -E 's/TARGETED_DEVICE_FAMILY = "?1,2"?;/TARGETED_DEVICE_FAMILY = 1;/g' "$PBX"
# Version from package.json
VERSION=$(node -p "require('./package.json').version")
sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${VERSION};/g" "$PBX"
echo "Patched Info.plist and project (version ${VERSION}, iPhone only)"
