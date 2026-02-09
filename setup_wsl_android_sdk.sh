#!/bin/bash

# Set desired Android SDK location
export ANDROID_HOME=$HOME/android-sdk
export CMDLINE_TOOLS_ROOT=$ANDROID_HOME/cmdline-tools
export PATH=$CMDLINE_TOOLS_ROOT/latest/bin:$ANDROID_HOME/platform-tools:$PATH

# Check for Java
if ! command -v java &> /dev/null; then
    echo "Java not found. Installing OpenJDK 17..."
    sudo apt-get update
    sudo apt-get install -y openjdk-17-jdk
fi

# Create directory structure
mkdir -p $CMDLINE_TOOLS_ROOT

# Download Command Line Tools (latest version as of early 2026/late 2025)
# Using a known stable version URL or latest
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
ZIP_FILE="commandlinetools-linux.zip"

if [ ! -d "$CMDLINE_TOOLS_ROOT/latest" ]; then
    echo "Downloading Android Command Line Tools..."
    wget -q $CMDLINE_TOOLS_URL -O $ZIP_FILE
    
    echo "Unzipping..."
    unzip -q $ZIP_FILE -d $CMDLINE_TOOLS_ROOT
    
    # Move to 'latest' as required by sdkmanager
    mv $CMDLINE_TOOLS_ROOT/cmdline-tools $CMDLINE_TOOLS_ROOT/latest
    rm $ZIP_FILE
else
    echo "Command Line Tools already installed."
fi

# Persist environment variables
if ! grep -q "ANDROID_HOME" ~/.bashrc; then
    echo "" >> ~/.bashrc
    echo "# Android SDK" >> ~/.bashrc
    echo "export ANDROID_HOME=$HOME/android-sdk" >> ~/.bashrc
    echo "export PATH=\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH" >> ~/.bashrc
    echo "Added ANDROID_HOME to ~/.bashrc"
fi

# Accept licenses
echo "Accepting licenses..."
yes | sdkmanager --licenses --sdk_root=$ANDROID_HOME

# Install Platform Tools and Build Tools
echo "Installing platform-tools and build-tools..."
sdkmanager "platform-tools" "build-tools;34.0.0" "platforms;android-34" --sdk_root=$ANDROID_HOME

echo "Android SDK setup complete."
