# deployment-config Specification

## Purpose
TBD - created by archiving change refine-telegram-service-infrastructure. Update Purpose after archive.
## Requirements
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

