#!/bin/bash
export NVM_DIR="$HOME/.nvm"

# Install NVM if not found
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "Installing NVM..."
    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

# Load NVM
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node 20
echo "Installing Node 20..."
nvm install 20
nvm alias default 20
nvm use 20

echo "Node version:"
node -v
echo "NPM version:"
npm -v

# Install dependencies with legacy peer deps to avoid conflicts
echo "Installing dependencies..."
npm install --legacy-peer-deps

echo "Installing missing worklets packages..."
npm install react-native-worklets-core react-native-worklets --legacy-peer-deps
