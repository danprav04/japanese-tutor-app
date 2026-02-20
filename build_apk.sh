#!/bin/bash
set -e
source ./setup_wsl_android_sdk.sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd android
./gradlew assembleDebug
