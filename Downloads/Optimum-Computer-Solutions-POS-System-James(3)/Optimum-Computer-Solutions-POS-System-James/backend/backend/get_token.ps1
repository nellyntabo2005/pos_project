# get_token.ps1
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host " GETTING JWT TOKEN " -ForegroundColor White -NoNewline
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host "=" -ForegroundColor Green
Write-Host ""

# Login credentials
$username = "Nelly"
$password = "Kerubo@20"

Write-Host "Logging in as: $username" -ForegroundColor Yellow

# Prepare request body
$body = @{
    username = $username
    password = $password
} | ConvertTo-Json

try {
    # Send login request
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/token/" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
    
    # Get token
    $token = $response.access
    $refreshToken = $response.refresh
    
    Write-Host ""
    Write-Host "✅ LOGIN SUCCESSFUL!" -ForegroundColor Green
    Write-Host ""
    Write-Host "ACCESS TOKEN:" -ForegroundColor Cyan
    Write-Host $token -ForegroundColor Gray
    Write-Host ""
    Write-Host "REFRESH TOKEN:" -ForegroundColor Cyan
    Write-Host $refreshToken -ForegroundColor Gray
    Write-Host ""
    
    # Save token to environment variable for current session
    $env:ERP_TOKEN = $token
    Write-Host "Token saved to: `$env:ERP_TOKEN" -ForegroundColor Yellow
    Write-Host ""
    
    # Test the token
    Write-Host "Testing token..." -ForegroundColor Yellow
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    $testResponse = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/products/" `
        -Method GET `
        -Headers $headers
    
    Write-Host "✅ Token is VALID! Products found: $($testResponse.count)" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "❌ LOGIN FAILED!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}