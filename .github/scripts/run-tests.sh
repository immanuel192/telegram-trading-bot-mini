#!/bin/bash
set -e

# Test execution script for CI environment
# This script runs all tests sequentially with coverage reporting
# It is designed to run inside the Docker test-runner container

echo "========================================="
echo "CI Test Execution Script"
echo "========================================="
echo ""

# Set CI environment variable
export CI=true

echo "Installing dependencies..."
npm ci
echo "✓ Dependencies installed"
echo ""

echo "Waiting for services to be ready..."

wait_for_service() {
  host=$1
  port=$2
  echo -n "  Waiting for $host:$port..."
  
  retries=30
  count=0
  
  while [ $count -lt $retries ]; do
    if node -e "
      const net = require('net');
      const client = net.createConnection($port, '$host');
      client.setTimeout(2000);
      client.on('connect', () => { client.end(); process.exit(0); });
      client.on('error', () => process.exit(1));
      client.on('timeout', () => { client.destroy(); process.exit(1); });
    " 2>/dev/null; then
      echo " ✓"
      return 0
    fi
    
    echo -n "."
    sleep 1
    count=$((count+1))
  done
  
  echo ""
  echo " ✗ Failed to connect to $host:$port after $retries attempts."
  exit 1
}

wait_for_mongo() {
  echo -n "  Waiting for MongoDB (Replica Set)..."
  
  retries=30
  count=0
  
  while [ $count -lt $retries ]; do
    if node -e "
      const { MongoClient } = require('mongodb');
      const uri = process.env.MONGODB_URI || 'mongodb://mongo:27017/?replicaSet=rs0&directConnection=true';
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
      
      async function check() {
        try {
          await client.connect();
          await client.db('admin').command({ ping: 1 });
          await client.close();
          process.exit(0);
        } catch (e) {
          process.exit(1);
        }
      }
      check();
    " 2>/dev/null; then
      echo " ✓"
      return 0
    fi
    
    echo -n "."
    sleep 2
    count=$((count+1))
  done
  
  echo ""
  echo " ✗ Failed to connect to MongoDB Replica Set after $retries attempts."
  # Print actual error for debugging
  node -e "
      const { MongoClient } = require('mongodb');
      const uri = process.env.MONGODB_URI || 'mongodb://mongo:27017/?replicaSet=rs0&directConnection=true';
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
      client.connect().then(() => client.close()).catch(e => console.error('   Error:', e.message));
  "
  exit 1
}

wait_for_mongo
wait_for_service redis 6379
echo ""

echo "========================================="
echo "Running Tests"
echo "========================================="
echo ""

# Run tests for libs first (foundational)
echo "📦 Running tests for shared-utils..."
npx nx test shared-utils --coverage
echo "✓ shared-utils tests passed"
echo ""

echo "📦 Running tests for dal..."
npx nx test dal --coverage
echo "✓ dal tests passed"
echo ""

# Run tests for apps
echo "🚀 Running tests for telegram-service..."
npx nx test telegram-service --coverage
echo "✓ telegram-service tests passed"
echo ""

echo "🚀 Running tests for interpret-service..."
npx nx test interpret-service --coverage
echo "✓ interpret-service tests passed"
echo ""

echo "🚀 Running tests for trade-manager..."
npx nx test trade-manager --coverage
echo "✓ trade-manager tests passed"
echo ""

echo "========================================="
echo "Building Applications"
echo "========================================="
echo ""

echo "🔨 Building telegram-service..."
npx nx build telegram-service
echo "✓ telegram-service built"
echo ""

echo "🔨 Building interpret-service..."
npx nx build interpret-service
echo "✓ interpret-service built"
echo ""

echo "🔨 Building trade-manager..."
npx nx build trade-manager
echo "✓ trade-manager built"
echo ""

echo "========================================="
echo "Coverage Summary"
echo "========================================="
echo ""

# Create temp directory for coverage files
mkdir -p coverage/temp

# Copy coverage files from each project, renaming them to avoid collisions
echo "Collecting coverage files..."
cp coverage/libs/shared/utils/coverage-final.json coverage/temp/shared-utils.json 2>/dev/null || echo "⚠️ No coverage for shared-utils"
cp coverage/libs/dal/coverage-final.json coverage/temp/dal.json 2>/dev/null || echo "⚠️ No coverage for dal"
cp coverage/apps/telegram-service/coverage-final.json coverage/temp/telegram-service.json 2>/dev/null || echo "⚠️ No coverage for telegram-service"
cp coverage/apps/interpret-service/coverage-final.json coverage/temp/interpret-service.json 2>/dev/null || echo "⚠️ No coverage for interpret-service"
cp coverage/apps/trade-manager/coverage-final.json coverage/temp/trade-manager.json 2>/dev/null || echo "⚠️ No coverage for trade-manager"

echo ""
echo "Merging coverage reports..."
# Merge all coverage files into one
npx -y nyc merge coverage/temp coverage/merged-coverage.json

echo ""
echo "Generating combined report..."
# Generate text summary from the merged file
# We use --temp-dir to point to the directory containing merged-coverage.json
# Note: nyc expects the file to be named specific ways or we might need to move it to .nyc_output
mkdir -p .nyc_output
cp coverage/merged-coverage.json .nyc_output/out.json
npx -y nyc report --reporter=text --reporter=text-summary --report-dir=coverage/combined

echo ""
echo "========================================="
echo "✅ All tests and builds completed successfully!"
echo "========================================="
