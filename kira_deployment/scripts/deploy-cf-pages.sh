#!/bin/bash
# Cloudflare Pages Deployment Script
# Usage: ./deploy-cf-pages.sh <project-name> <domain>

set -e

PROJECT=${1:-}
DOMAIN=${2:-}

if [ -z "$PROJECT" ] || [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <project-name> <domain>"
  echo "Example: $0 kira-dao dao.kiraos.live"
  exit 1
fi

ACCOUNT_ID="9921be3b2e194f4f0af3bd01ae704a82"
API_TOKEN=$(op item get uko3mc6mofprio7dt56cozkfdu --vault="Kira" --reveal 2>&1 | grep "credential:" | awk '{print $2}')

cd "/workspace/kira/projects/$PROJECT"

echo "📦 Deploying $PROJECT to Cloudflare Pages..."

# Calculate file hashes and sizes
INDEX_HASH=$(sha256sum index.html | awk '{print $1}')
INDEX_SIZE=$(stat -c%s index.html)
CNAME_HASH=$(sha256sum CNAME 2>/dev/null | awk '{print $1}')
CNAME_SIZE=$(stat -c%s CNAME 2>/dev/null || echo "0")

# Build manifest
if [ -f "CNAME" ]; then
  MANIFEST="{\"index.html\":{\"hash\":\"$INDEX_HASH\",\"size\":$INDEX_SIZE},\"CNAME\":{\"hash\":\"$CNAME_HASH\",\"size\":$CNAME_SIZE}}"
  FILES="-F \"index.html=@index.html\" -F \"CNAME=@CNAME\""
else
  MANIFEST="{\"index.html\":{\"hash\":\"$INDEX_HASH\",\"size\":$INDEX_SIZE}}"
  FILES="-F \"index.html=@index.html\""
fi

# Create deployment
echo "  Creating deployment..."
DEPLOYMENT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT/deployments" \
  -H "Authorization: Bearer $API_TOKEN" \
  -F "branch=main" \
  -F "manifest=$MANIFEST" \
  -F "index.html=@index.html")

DEPLOYMENT_ID=$(echo "$DEPLOYMENT" | jq -r '.result.id // empty')

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "  ❌ Deployment failed:"
  echo "$DEPLOYMENT" | jq -r '.errors[0].message'
  exit 1
fi

echo "  ✅ Deployment created: $DEPLOYMENT_ID"

# Add custom domain if not exists
echo "  Checking custom domain..."
DOMAIN_EXISTS=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT/domains" \
  -H "Authorization: Bearer $API_TOKEN" | jq -r --arg d "$DOMAIN" '.result[] | select(.domain == $d) | .domain')

if [ -z "$DOMAIN_EXISTS" ]; then
  echo "  Adding custom domain: $DOMAIN"
  curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT/domains" \
    -H "Authorization: Bearer $API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$DOMAIN\"}" > /dev/null
  echo "  ✅ Domain added"
else
  echo "  ✅ Domain already configured"
fi

echo ""
echo "🌐 https://$DOMAIN"
echo "   (Propagation may take 1-2 minutes)"
