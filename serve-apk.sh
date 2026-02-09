#!/bin/bash

# Navigate to the debug APK directory
TARGET_DIR="android/app/build/outputs/apk/debug"

if [ -d "$TARGET_DIR" ]; then
    echo "Starting HTTP server in $TARGET_DIR"
    echo "You can access the APK at http://localhost:8000/"
    
    # Change directory and start the server
    cd "$TARGET_DIR" || exit
    python -m http.server 8000
else
    echo "Error: Directory $TARGET_DIR not found."
    echo "Please ensure you have built the project first."
    exit 1
fi
