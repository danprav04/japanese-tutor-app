# Navigate to the debug APK directory
$TargetDir = "android\app\build\outputs\apk\debug"

if (Test-Path $TargetDir) {
    Write-Host "Starting HTTP server in $TargetDir" -ForegroundColor Cyan
    Write-Host "You can access the APK at http://localhost:8000/" -ForegroundColor Green
    
    # Change directory and start the server
    Push-Location $TargetDir
    try {
        python -m http.server 8000
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "Error: Directory $TargetDir not found." -ForegroundColor Red
    Write-Host "Please ensure you have built the project first."
    exit 1
}
