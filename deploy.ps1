
# Login
Write-Host "Logging into Google Cloud..."
gcloud auth login

# Set Project (User needs to replace PROJECT_ID)
$projectId = Read-Host "Enter your Google Cloud Project ID"
gcloud config set project $projectId

# Build and Push
Write-Host "Building Docker Image..."
gcloud builds submit --tag gcr.io/$projectId/tempered-glass-checker

# Deploy
Write-Host "Deploying to Cloud Run..."
gcloud run deploy tempered-glass-checker `
  --image gcr.io/$projectId/tempered-glass-checker `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated `
  --port 3000

Write-Host "Deployment Complete!"
