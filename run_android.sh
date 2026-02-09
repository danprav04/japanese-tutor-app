#!/bin/bash
set -e

# Source environment
. ./setup_wsl_android_sdk.sh > /dev/null
. ./setup_wsl_adb.sh > /dev/null

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "Stopping Gradle Daemon..."
cd android || exit
./gradlew --stop

echo "Building app..."
./gradlew assembleDebug

echo "Installing app..."
# Try uninstalling first (fixes misleading storage errors)
adb uninstall com.japanesetutor.app || true
if adb install -r app/build/outputs/apk/debug/app-debug.apk; then
    echo "Install successful."
else
    echo "Install failed."
    exit 1
fi

echo "Starting Expo bundler..."
cd ..
npx expo start
