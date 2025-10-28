# Azure Static Web Apps Deployment Guide

## Overview
This guide will help you deploy the StockApp to Azure Static Web Apps with an integrated Azure Functions backend.

## Architecture
- **Frontend**: Static HTML/JS (`frontend/` folder)
- **Backend**: Azure Functions (Node.js) (`backend-js/` folder)
- **Database**: Azure Cosmos DB (NoSQL)
- **Hosting**: Azure Static Web Apps

## Prerequisites
1. Azure subscription
2. Azure Static Web Apps resource created
3. Azure Cosmos DB account set up
4. GitHub repository

## Setup Steps

### 1. Create Azure Static Web Apps Resource

```bash
# Install Azure CLI if not already installed
# Login to Azure
az login

# Create a resource group (if you don't have one)
az group create --name StockAppRG --location eastus

# Create Static Web App
az staticwebapp create \
  --name StockAppSWA \
  --resource-group StockAppRG \
  --source https://github.com/YOUR_USERNAME/StockApp \
  --location eastus2 \
  --branch master \
  --app-location "frontend" \
  --api-location "backend-js" \
  --output-location "" \
  --login-with-github
```

### 2. Get Deployment Token

```bash
# Get the deployment token
az staticwebapp secrets list \
  --name StockAppSWA \
  --resource-group StockAppRG \
  --query "properties.apiKey" -o tsv
```

### 3. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secret:
- `AZURE_STATIC_WEB_APPS_API_TOKEN`: (paste the token from step 2)

### 4. Configure Cosmos DB Connection

In Azure Portal:
1. Go to your Static Web App resource
2. Navigate to **Configuration**
3. Add the following application settings:

| Name | Value |
|------|-------|
| `CosmosConnectionString` | Your Cosmos DB connection string |
| `CosmosDatabaseName` | `stockDB` |
| `CosmosContainerName` | `stockContainer` |

**Important**: Never commit connection strings to git!

### 5. Deploy

The workflow will automatically trigger on:
- Push to `master` branch
- Pull request creation/updates
- Manual workflow dispatch

To manually trigger:
1. Go to GitHub → Actions
2. Select "Azure Static Web Apps CI/CD"
3. Click "Run workflow"

## Workflow Features

✅ **Automatic deployment** on push to master  
✅ **PR preview environments** for testing  
✅ **Automatic cleanup** when PRs are closed  
✅ **Frontend + Backend** deployed together  
✅ **Environment isolation** per PR  

## Local Development

### Frontend
```bash
# Just open the HTML file
start frontend/viewer.html
```

### Backend
```bash
cd backend-js
npm install
func start
```

### Environment Variables (local.settings.json)
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "CosmosConnectionString": "YOUR_COSMOS_CONNECTION_STRING",
    "CosmosDatabaseName": "stockDB",
    "CosmosContainerName": "watchlist"
  }
}
```

## Security Best Practices

1. ✅ Connection strings in environment variables only
2. ✅ `local.settings.json` in `.gitignore`
3. ✅ Regenerate any exposed keys immediately
4. ✅ Use Azure RBAC for production
5. ✅ Enable Managed Identity when possible

## Troubleshooting

### Deployment Fails
- Check GitHub Actions logs
- Verify secrets are set correctly
- Ensure Azure resource exists

### API Not Working
- Check Azure Functions logs in Portal
- Verify Cosmos DB connection string
- Check CORS settings in Static Web App

### 404 Errors
- Check `staticwebapp.config.json` routes
- Verify file paths in workflow

## Monitoring

- **Application Insights**: Automatic with Static Web Apps
- **Logs**: Available in Azure Portal → Static Web App → Log Stream
- **Metrics**: Azure Portal → Static Web App → Metrics

## Cost Optimization

- Static Web Apps Free tier: 100 GB bandwidth/month
- Azure Functions Consumption plan: Pay per execution
- Cosmos DB Serverless: Pay per request

## Next Steps

1. Set up custom domain
2. Configure authentication (Azure AD, GitHub, etc.)
3. Add staging environments
4. Set up monitoring alerts
5. Implement CI/CD for database migrations
