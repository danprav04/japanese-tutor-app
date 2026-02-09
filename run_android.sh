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
./gradlew installDebug --info

echo "Starting Expo bundler..."
cd ..
npx expo start
