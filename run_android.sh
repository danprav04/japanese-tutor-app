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

echo "Building and installing app..."
if ./gradlew installDebug --info; then
    echo "Gradle install successful."
else
    echo "Gradle install failed. Attempting manual ADB install..."
    # Try uninstalling first (fixes misleading storage errors)
    adb uninstall com.japanesetutor.app || true
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
fi

echo "Starting Expo bundler..."
cd ..
npx expo start
