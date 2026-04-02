#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[INFO] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

prompt() {
    echo -e "${BLUE}[PROMPT] $1${NC}"
}

# Determine the current user
CURRENT_USER=$(whoami)
PROJECT_DIR=$(pwd)

log "Starting server setup as user: $CURRENT_USER"

# ============================================================================
# PHASE 1: Root/Sudo Setup (User Creation & SSH Hardening)
# ============================================================================
if [ "$CURRENT_USER" = "root" ] || [ "$EUID" -eq 0 ]; then
    log "Running as root. Setting up system user and security..."
    
    # Create tradingbot user if it doesn't exist
    if id "tradingbot" &>/dev/null; then
        log "User 'tradingbot' already exists."
    else
        log "Creating user 'tradingbot'..."
        adduser --disabled-password --gecos "" tradingbot
        echo "tradingbot:$(openssl rand -base64 32)" | chpasswd
        usermod -aG sudo tradingbot
        log "User 'tradingbot' created with sudo privileges."
    fi
    
    # Setup SSH keys for tradingbot user
    log "Setting up SSH keys for tradingbot user..."
    if [ -d "/root/.ssh" ] && [ -f "/root/.ssh/authorized_keys" ]; then
        mkdir -p /home/tradingbot/.ssh
        cp /root/.ssh/authorized_keys /home/tradingbot/.ssh/authorized_keys
        chown -R tradingbot:tradingbot /home/tradingbot/.ssh
        chmod 700 /home/tradingbot/.ssh
        chmod 600 /home/tradingbot/.ssh/authorized_keys
        log "SSH keys copied from root to tradingbot user."
    else
        warn "No SSH keys found in /root/.ssh. You'll need to add them manually."
        prompt "Add your public key to /home/tradingbot/.ssh/authorized_keys after this script completes."
    fi
    
    # SSH Hardening
    log "Hardening SSH configuration..."
    SSH_CONFIG="/etc/ssh/sshd_config"
    
    # Backup original config
    if [ ! -f "${SSH_CONFIG}.backup" ]; then
        cp $SSH_CONFIG ${SSH_CONFIG}.backup
    fi
    
    # Update SSH settings
    sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' $SSH_CONFIG
    sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' $SSH_CONFIG
    sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' $SSH_CONFIG
    
    log "Restarting SSH service..."
    systemctl restart ssh || systemctl restart sshd
    
    # Setup UFW Firewall
    log "Configuring UFW firewall..."
    apt install -y ufw
    ufw --force default deny incoming
    ufw --force default allow outgoing
    ufw --force allow ssh
    ufw --force enable
    log "Firewall configured."
    
    # System Updates
    log "Updating system packages..."
    apt update && apt upgrade -y
    apt install -y git build-essential curl
    
    # Copy project to tradingbot user's home
    ATB_PROJECT_DIR="/home/tradingbot/telegram-trading-bot-mini"
    if [ "$PROJECT_DIR" != "$ATB_PROJECT_DIR" ]; then
        log "Copying project to /home/tradingbot/telegram-trading-bot-mini..."
        mkdir -p /home/tradingbot
        cp -r "$PROJECT_DIR" "$ATB_PROJECT_DIR" 2>/dev/null || true
        chown -R tradingbot:tradingbot "$ATB_PROJECT_DIR"
    fi
    
    log "Root setup complete. Switching to tradingbot user..."
    
    # Re-run this script as tradingbot user
    exec sudo -u tradingbot -i bash "$ATB_PROJECT_DIR/infra/scripts/setup-server.sh"
    exit 0
fi

# ============================================================================
# PHASE 2: ATB User Setup (Environment & Application)
# ============================================================================
log "Running as tradingbot user. Setting up Node.js environment and application..."

# NVM & Node.js
log "Checking NVM installation..."
export NVM_DIR="$HOME/.nvm"

if [ ! -d "$NVM_DIR" ]; then
    log "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

# Load NVM
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

log "Installing Node.js LTS..."
nvm install --lts
nvm use --lts
nvm alias default lts/*

NODE_VER=$(node -v)
log "Node.js $NODE_VER installed."

# Global Packages
log "Installing global packages (pm2, nx)..."
npm install -g pm2 nx

# Navigate to project directory
cd "$HOME/telegram-trading-bot-mini" || cd "$PROJECT_DIR"
PROJECT_DIR=$(pwd)

# Environment Setup - Copy .env.sample files for each app
log "Setting up environment files for each app..."

APPS=("telegram-service" "interpret-service" "trade-manager" "executor-service")
ENV_FILES_CREATED=false

for APP in "${APPS[@]}"; do
    APP_DIR="$PROJECT_DIR/apps/$APP"
    if [ -d "$APP_DIR" ]; then
        ENV_LOCAL="$APP_DIR/.env.sample"
        ENV_PROD="$APP_DIR/.env"
        
        if [ -f "$ENV_LOCAL" ] && [ ! -f "$ENV_PROD" ]; then
            log "Creating .env for $APP from .env.sample template..."
            cp "$ENV_LOCAL" "$ENV_PROD"
            ENV_FILES_CREATED=true
        elif [ -f "$ENV_PROD" ]; then
            log ".env already exists for $APP"
        else
            warn "No .env.sample template found for $APP"
        fi
    fi
done

# Build & Install
log "Installing dependencies..."
npm install

log "Building project..."
npm run build

# Create logs directory for PM2
mkdir -p "$PROJECT_DIR/logs"

log "========================================="
log "Server setup complete!"
log "========================================="

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

log "Next steps:"
echo ""
echo "1. Edit the .env files for each app with your production configuration:"
echo "   - TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION"
echo "   - MONGODB_URI, MONGODB_DBNAME"
echo "   - REDIS_URL, REDIS_TOKEN (for Upstash Redis)"
echo "   - SENTRY_DSN"
echo "   - NEW_RELIC_ENABLED, NEW_RELIC_LICENSE_KEY, NEW_RELIC_APP_NAME (optional)"
echo ""
echo "2. After configuring, start the application with PM2:"
echo "   pm2 start infra/pm2/ecosystem.config.js"
echo ""
echo "3. Save PM2 process list:"
echo "   pm2 save"
echo ""
echo "4. View application status:"
echo "   pm2 list"
echo ""
echo "5. View logs:"
echo "   pm2 logs"
echo ""
log "========================================="
