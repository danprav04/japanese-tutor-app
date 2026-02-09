#!/bin/bash

# Configure ADB to connect to Windows
# Get the IP address of the Windows host from /etc/resolv.conf
WSL_HOST_IP=$(grep nameserver /etc/resolv.conf | awk '{print $2}')

if [ -z "$WSL_HOST_IP" ]; then
    echo "Error: Could not determine Windows host IP."
    exit 1
fi

echo "Windows Host IP: $WSL_HOST_IP"

# Export the environment variable
export ADB_SERVER_SOCKET=tcp:$WSL_HOST_IP:5038

# Persist the environment variable in .bashrc
if ! grep -q "ADB_SERVER_SOCKET" ~/.bashrc; then
    echo "" >> ~/.bashrc
    echo "# Configure ADB to connect to Windows" >> ~/.bashrc
    echo "export ADB_SERVER_SOCKET=tcp:\$(grep nameserver /etc/resolv.conf | awk '{print \$2}'):5038" >> ~/.bashrc
    echo "Added ADB_SERVER_SOCKET to ~/.bashrc"
else
    echo "ADB_SERVER_SOCKET already present in ~/.bashrc"
fi

echo "ADB configured."
echo "Current ADB_SERVER_SOCKET: $ADB_SERVER_SOCKET"

echo "Checking connected devices..."
adb devices
