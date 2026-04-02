#!/bin/bash

# MongoDB Backup and Restore Script
# This script provides an interactive interface for backing up and restoring MongoDB databases
# using mongodump and mongorestore utilities.
#
# Features:
# - Interactive prompts for connection details
# - Support for both directory-based and archive-based backups
# - Automatic timestamp-based backup naming
# - Validation of inputs and MongoDB connection

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

print_error() {
    echo -e "${RED}✗ ${NC}$1"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

# Function to check if mongodump/mongorestore are installed
check_mongo_tools() {
    if ! command -v mongodump &> /dev/null; then
        print_error "mongodump is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v mongorestore &> /dev/null; then
        print_error "mongorestore is not installed or not in PATH"
        exit 1
    fi
    
    print_success "MongoDB tools found"
}

# Function to validate MongoDB connection URL
validate_connection() {
    local uri="$1"
    
    print_info "Validating MongoDB connection..."
    
    # Try to connect using mongosh or mongo
    if command -v mongosh &> /dev/null; then
        if mongosh "$uri" --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
            print_success "Connection successful"
            return 0
        fi
    elif command -v mongo &> /dev/null; then
        if mongo "$uri" --eval "db.adminCommand('ping')" --quiet &> /dev/null; then
            print_success "Connection successful"
            return 0
        fi
    else
        print_warning "mongosh/mongo not found, skipping connection validation"
        return 0
    fi
    
    print_error "Failed to connect to MongoDB"
    return 1
}

# Function to perform backup
perform_backup() {
    local uri="$1"
    local db_name="$2"
    local backup_location="$3"
    local backup_format="$4"
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    if [ "$backup_format" == "archive" ]; then
        # Archive mode - single compressed file
        local archive_file="${backup_location}/${db_name}_${timestamp}.archive.gz"
        
        print_info "Starting backup to archive: $archive_file"
        
        mongodump \
            --uri="$uri" \
            --db="$db_name" \
            --archive="$archive_file" \
            --gzip
        
        print_success "Backup completed successfully!"
        print_info "Archive location: $archive_file"
        print_info "Archive size: $(du -h "$archive_file" | cut -f1)"
        
    else
        # Directory mode - one file per collection
        local backup_dir="${backup_location}/${db_name}_${timestamp}"
        
        print_info "Starting backup to directory: $backup_dir"
        
        mongodump \
            --uri="$uri" \
            --db="$db_name" \
            --out="$backup_dir"
        
        print_success "Backup completed successfully!"
        print_info "Backup location: $backup_dir"
        print_info "Backup size: $(du -sh "$backup_dir" | cut -f1)"
        print_info "Collections backed up:"
        ls -1 "$backup_dir/$db_name" | grep -E '\.bson$' | sed 's/\.bson$//' | sed 's/^/  - /'
    fi
}

# Function to perform restore
perform_restore() {
    local uri="$1"
    local db_name="$2"
    local restore_source="$3"
    
    # Detect if source is an archive or directory
    if [[ "$restore_source" == *.archive.gz ]] || [[ "$restore_source" == *.archive ]]; then
        # Archive mode
        print_info "Restoring from archive: $restore_source"
        
        if [ ! -f "$restore_source" ]; then
            print_error "Archive file not found: $restore_source"
            exit 1
        fi
        
        print_warning "This will restore data to database: $db_name"
        read -p "Are you sure you want to continue? (yes/no): " confirm
        
        if [ "$confirm" != "yes" ]; then
            print_info "Restore cancelled"
            exit 0
        fi
        
        mongorestore \
            --uri="$uri" \
            --db="$db_name" \
            --archive="$restore_source" \
            --gzip \
            --drop
        
    else
        # Directory mode
        print_info "Restoring from directory: $restore_source"
        
        if [ ! -d "$restore_source" ]; then
            print_error "Directory not found: $restore_source"
            exit 1
        fi
        
        # Check if the directory contains the database folder
        local db_path
        if [ -d "$restore_source/$db_name" ]; then
            db_path="$restore_source"
        elif [ -d "$restore_source" ] && ls "$restore_source"/*.bson &> /dev/null; then
            # Directory contains .bson files directly
            db_path="$restore_source"
        else
            print_error "Invalid backup directory structure"
            exit 1
        fi
        
        print_warning "This will restore data to database: $db_name"
        read -p "Are you sure you want to continue? (yes/no): " confirm
        
        if [ "$confirm" != "yes" ]; then
            print_info "Restore cancelled"
            exit 0
        fi
        
        mongorestore \
            --uri="$uri" \
            --db="$db_name" \
            --dir="$db_path" \
            --drop
    fi
    
    print_success "Restore completed successfully!"
}

# Main script
main() {
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║  MongoDB Backup & Restore Utility     ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    
    # Check if MongoDB tools are installed
    check_mongo_tools
    
    # Get MongoDB connection URL
    echo ""
    print_info "Enter MongoDB connection details"
    read -p "MongoDB Connection URI (e.g., mongodb://localhost:27017): " mongo_uri
    
    if [ -z "$mongo_uri" ]; then
        print_error "Connection URI cannot be empty"
        exit 1
    fi
    
    # Validate connection
    if ! validate_connection "$mongo_uri"; then
        print_warning "Connection validation failed, but continuing anyway..."
    fi
    
    # Get database name
    echo ""
    read -p "Database name: " db_name
    
    if [ -z "$db_name" ]; then
        print_error "Database name cannot be empty"
        exit 1
    fi
    
    # Get operation type
    echo ""
    print_info "Select operation:"
    echo "  1) Backup"
    echo "  2) Restore"
    read -p "Enter choice (1 or 2): " operation
    
    case $operation in
        1)
            # Backup operation
            echo ""
            print_info "Select backup format:"
            echo "  1) Directory (one file per collection)"
            echo "  2) Archive (single compressed file)"
            read -p "Enter choice (1 or 2): " format_choice
            
            case $format_choice in
                1) backup_format="directory" ;;
                2) backup_format="archive" ;;
                *)
                    print_error "Invalid choice"
                    exit 1
                    ;;
            esac
            
            echo ""
            read -p "Backup location (directory path): " backup_location
            
            if [ -z "$backup_location" ]; then
                print_error "Backup location cannot be empty"
                exit 1
            fi
            
            # Create backup directory if it doesn't exist
            mkdir -p "$backup_location"
            
            perform_backup "$mongo_uri" "$db_name" "$backup_location" "$backup_format"
            ;;
            
        2)
            # Restore operation
            echo ""
            read -p "Restore source (archive file or directory path): " restore_source
            
            if [ -z "$restore_source" ]; then
                print_error "Restore source cannot be empty"
                exit 1
            fi
            
            perform_restore "$mongo_uri" "$db_name" "$restore_source"
            ;;
            
        *)
            print_error "Invalid operation choice"
            exit 1
            ;;
    esac
    
    echo ""
    print_success "Operation completed successfully!"
    echo ""
}

# Run main function
main
