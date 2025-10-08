#!/bin/bash
# Script to manually trigger document matching

# Get your user_id from Supabase or the browser console
USER_ID="c9c61043-ce21-4303-bb16-61f883f2f619"  # Replace with your actual user_id

echo "🚀 Triggering document matching for user: $USER_ID"
echo ""

# Call the compute-matches endpoint
curl -X POST http://localhost:3000/api/cron/compute-matches \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: local-dev-matching-123" \
  -d "{\"user_id\": \"$USER_ID\"}"

echo ""
echo ""
echo "✅ Matching request sent!"
echo "Check the Next.js terminal for logs."
