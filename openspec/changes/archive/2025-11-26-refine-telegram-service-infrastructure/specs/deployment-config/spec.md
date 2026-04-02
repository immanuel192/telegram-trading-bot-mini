# Spec: Deployment Configuration

**Capability**: `deployment-config`  
**Related Change**: `refine-telegram-service-infrastructure`

## Overview

This spec defines requirements for deployment scripts, build configuration, and environment variable templates to ensure reliable deployment.

## ADDED Requirements

### Requirement: Build Script Configuration
The build script in `package.json` MUST successfully build all apps and libraries in the monorepo.

#### Scenario: Build all projects
**Given** the repository is in a clean state  
**And** dependencies are installed  
**When** `npm run build` is executed  
**Then** all apps MUST be built successfully  
**And** all libs MUST be built successfully  
**And** the `dist/` directory MUST contain build outputs  
**And** no errors MUST be reported

#### Scenario: Build script uses correct Nx command
**Given** the `package.json` file is reviewed  
**When** the `build` script is examined  
**Then** it MUST use `nx run-many -t build`  
**And** it MUST NOT use deprecated or incorrect commands

### Requirement: Environment Variable Templates
Each app MUST have a `.env.local` template file that includes all required configuration variables.

#### Scenario: Telegram service .env.local template
**Given** the `apps/telegram-service/.env.local` file exists  
**When** the file is reviewed  
**Then** it MUST include all required variables:
  - `TELEGRAM_API_ID`
  - `TELEGRAM_API_HASH`
  - `TELEGRAM_SESSION`
  - `MONGODB_URI`
  - `MONGODB_DBNAME`
  - `REDIS_URL`
  - `REDIS_TOKEN`
  - `SENTRY_DSN`
  - `PORT`
  - `NODE_ENV`
  - `LOG_LEVEL`
  - `STREAM_MESSAGE_TTL_IN_SEC`
  - `NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA`
  - `PUSHSAFER_API_KEY`
**And** each variable MUST have a comment explaining its purpose  
**And** each variable MUST have a placeholder or example value

#### Scenario: Interpret service .env.local template
**Given** the `apps/interpret-service/.env.local` file exists  
**When** the file is reviewed  
**Then** it MUST include all required variables for the interpret service  
**And** each variable MUST have a comment explaining its purpose

#### Scenario: Trade manager .env.local template
**Given** the `apps/trade-manager/.env.local` file exists  
**When** the file is reviewed  
**Then** it MUST include all required variables for the trade manager  
**And** each variable MUST have a comment explaining its purpose

### Requirement: Server Setup Script
The `infra/scripts/setup-server.sh` script MUST correctly set up the server environment and build the application.

#### Scenario: Setup script uses correct build command
**Given** the `setup-server.sh` script is reviewed  
**When** the build step is examined  
**Then** it MUST use the same build command as `package.json`  
**And** the build command MUST be `npm run build`  
**And** the build MUST succeed during setup

#### Scenario: Setup script copies environment templates
**Given** the `setup-server.sh` script is executed  
**When** environment setup is performed  
**Then** `.env.local` templates MUST be copied to `.env` for each app  
**And** the script MUST warn the user to edit the `.env` files  
**And** the script MUST list all `.env` files that need configuration

## Implementation Details

### package.json Build Script
```json
{
  "scripts": {
    "build": "nx run-many -t build"
  }
}
```

### Telegram Service .env.local Template
```bash
# Telegram Service Configuration

# Telegram API credentials (required)
# Get from https://my.telegram.org/apps
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
TELEGRAM_SESSION=your_session_string_here

# MongoDB Configuration (required)
# Local: mongodb://localhost:27017
# Production: mongodb+srv://user:pass@cluster.mongodb.net
MONGODB_URI=mongodb://localhost:27017
MONGODB_DBNAME=telegram-trading-bot

# Redis Stream Configuration (required)
# Local: redis://localhost:6379
# Upstash: https://your-instance.upstash.io
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=

# Sentry Configuration (optional, recommended for production)
# Get from https://sentry.io
SENTRY_DSN=

# Application Configuration
PORT=9001
NODE_ENV=development
LOG_LEVEL=info

# Stream Configuration
# Time-to-live for stream messages in seconds
STREAM_MESSAGE_TTL_IN_SEC=3600

# Push Notification Configuration
# Enable/disable media detection alerts (yes/no)
NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA=yes
# PushSafer API key (get from https://www.pushsafer.com)
PUSHSAFER_API_KEY=your_api_key_here
```

### Setup Script Build Step
```bash
# Build & Install
log "Installing dependencies..."
npm install

log "Building project..."
npm run build

# Verify build succeeded
if [ $? -ne 0 ]; then
  error "Build failed. Please check the error messages above."
  exit 1
fi
```

### Setup Script Environment Copy
```bash
# Environment Setup - Copy .env.local files for each app
log "Setting up environment files for each app..."

APPS=("telegram-service" "interpret-service" "trade-manager")
ENV_FILES_CREATED=false

for APP in "${APPS[@]}"; do
  APP_DIR="$PROJECT_DIR/apps/$APP"
  if [ -d "$APP_DIR" ]; then
    ENV_LOCAL="$APP_DIR/.env.local"
    ENV_PROD="$APP_DIR/.env"
    
    if [ -f "$ENV_LOCAL" ] && [ ! -f "$ENV_PROD" ]; then
      log "Creating .env for $APP from .env.local template..."
      cp "$ENV_LOCAL" "$ENV_PROD"
      ENV_FILES_CREATED=true
    elif [ -f "$ENV_PROD" ]; then
      log ".env already exists for $APP"
    else
      warn "No .env.local template found for $APP"
    fi
  fi
done

if [ "$ENV_FILES_CREATED" = true ]; then
  warn "IMPORTANT: Environment files have been created from templates."
  warn "You MUST edit the following files with your actual configuration:"
  echo ""
  for APP in "${APPS[@]}"; do
    ENV_FILE="$PROJECT_DIR/apps/$APP/.env"
    if [ -f "$ENV_FILE" ]; then
      echo "  - apps/$APP/.env"
    fi
  done
  echo ""
fi
```

## Validation Criteria

### Build Script
- [ ] `npm run build` completes without errors
- [ ] All apps are built to `dist/apps/`
- [ ] All libs are built to `dist/libs/`
- [ ] Build is reproducible (clean checkout)

### Environment Templates
- [ ] All `.env.local` files exist
- [ ] All required variables are present
- [ ] All variables have comments
- [ ] All variables have placeholder values
- [ ] Templates match app config requirements

### Setup Script
- [ ] Script runs without errors
- [ ] Build step succeeds
- [ ] Environment files are copied
- [ ] User is warned to edit `.env` files
- [ ] Script is idempotent (can run multiple times)

## Testing Requirements

### Manual Tests
- [ ] Run `npm run build` on clean checkout
- [ ] Run `setup-server.sh` in clean environment
- [ ] Verify all `.env` files are created
- [ ] Verify build outputs are correct
- [ ] Start apps with generated `.env` files

### CI Tests
- [ ] Build step in CI pipeline succeeds
- [ ] All apps and libs are built
- [ ] No build warnings or errors

## Error Handling

1. **Build Failure**: Script MUST exit with error code and clear message
2. **Missing Template**: Script MUST warn but continue
3. **Existing .env**: Script MUST NOT overwrite, log message instead
4. **Permission Issues**: Script MUST fail with clear error message

## Documentation Updates

- [ ] Update README.md with build instructions
- [ ] Update deployment docs with setup script usage
- [ ] Document all environment variables
- [ ] Add troubleshooting section for common build issues

## Migration Notes

- Existing `.env` files will NOT be overwritten
- Existing deployments should verify their `.env` files match the new template
- No breaking changes to existing configurations
