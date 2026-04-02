# Deployment Specification

## ADDED Requirements

### Requirement: Server Configuration
The application must be hosted on a cloud environment that meets minimum performance and reliability standards.

#### Scenario: Provisioning
- **Given** a cloud provider (DigitalOcean/Vultr)
- **When** a new server is provisioned
- **Then** it should have at least 4GB RAM and 2 CPU Cores
- **And** it should run a supported LTS version of Ubuntu (22.04+)
- **And** it should have a dedicated public IP address

### Requirement: Security Standards
The production environment must be secured against common threats and unauthorized access.

#### Scenario: User Access
- **Given** a fresh server
- **When** configuring access
- **Then** a dedicated non-root user (`tradingbot`) must be created
- **And** root login via SSH must be disabled
- **And** password authentication must be disabled in favor of SSH keys

#### Scenario: Network Security
- **Given** the server is active
- **When** configuring the firewall (UFW)
- **Then** only essential ports (SSH, HTTP/S if needed) should be open
- **And** all other incoming traffic must be denied

### Requirement: Deployment Process
A standardized process must be defined for deploying updates to the application.

#### Scenario: Manual Deployment
- **Given** a new code version is pushed to the repository
- **When** the engineer connects via SSH
- **Then** they should be able to pull the latest changes
- **And** build the application using `npm run build`
- **And** restart the services using `pm2 reload` with zero/minimal downtime

### Requirement: Automation
The setup process should be scriptable to reduce manual errors and setup time.

#### Scenario: Automated Setup
- **Given** a fresh server with the repository cloned
- **And** a valid `.env` file created by the user
- **When** the setup script is executed
- **Then** it should install all system dependencies (Node.js, PM2, etc.)
- **And** build the project
- **And** start the application services automatically
- **And** configure the services to restart on system boot
