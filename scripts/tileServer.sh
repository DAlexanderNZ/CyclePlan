#!/bin/bash

# CyclOSM Tile Server Setup Script
# This script automates the setup of the CyclOSM tile server using Docker
# Based on the instructions in cyclosm-tile-server/README.md
#
# Usage: ./tileServer.sh
#
# Prerequisites:
# - Docker must be installed and running
# - An OSM PBF file (merged.osm.pbf or any .osm.pbf file) should be present in:
#   - The cyclosm-tile-server directory, or
#   - The parent directory of the repository
#
# The script will:
# 1. Find and use merged.osm.pbf if available, otherwise use the first .osm.pbf file found
# 2. Build the cyclosm-tile-server Docker image
# 3. Create necessary Docker volumes (osm-data and osm-tiles)
# 4. Import the OSM data into PostgreSQL database
#
# Note: The import process can take a significant amount of time depending on the size
# of your OSM file and your system's performance.

set -e

# Change to the cyclosm-tile-server directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYCLOSM_DIR="$(dirname "$SCRIPT_DIR")/cyclosm-tile-server"

if [ ! -d "$CYCLOSM_DIR" ]; then
    echo "ERROR: cyclosm-tile-server directory not found at: $CYCLOSM_DIR"
    exit 1
fi

cd "$CYCLOSM_DIR"
echo "Changed to directory: $(pwd)"

# Find OSM PBF files
echo "Searching for OSM PBF files..."

# Look for merged.osm.pbf first, then any .osm.pbf files
OSM_PBF_FILE=""

if [ -f "merged.osm.pbf" ]; then
    OSM_PBF_FILE="merged.osm.pbf"
    echo "Found merged.osm.pbf file"
elif [ -f "../merged.osm.pbf" ]; then
    OSM_PBF_FILE="../merged.osm.pbf"
    echo "Found merged.osm.pbf in parent directory"
else
    # Find any .osm.pbf files in current and parent directory
    OSM_PBF_FILES=( $(find . .. -maxdepth 1 -name "*.osm.pbf" 2>/dev/null) )
    
    if [ ${#OSM_PBF_FILES[@]} -eq 0 ]; then
        echo "ERROR: No OSM PBF file found. Please download one from https://download.geofabrik.de/"
        echo "ERROR: Place the .osm.pbf file in the current directory or parent directory"
        exit 1
    elif [ ${#OSM_PBF_FILES[@]} -gt 1 ]; then
        echo "WARNING: Multiple OSM PBF files found:"
        for file in "${OSM_PBF_FILES[@]}"; do
            echo "  - $file"
        done
        echo "Using the first file: ${OSM_PBF_FILES[0]}"
        OSM_PBF_FILE="${OSM_PBF_FILES[0]}"
    else
        OSM_PBF_FILE="${OSM_PBF_FILES[0]}"
        echo "Found OSM PBF file: $OSM_PBF_FILE"
    fi
fi

# Convert relative path to absolute path
OSM_PBF_FILE="$(realpath "$OSM_PBF_FILE")"
echo "Using OSM PBF file: $OSM_PBF_FILE"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is not running. Please start Docker and try again."
    exit 1
fi

# Step 1: Build the Docker image
echo -e "\nBuilding CyclOSM tile server Docker image...\n"
if docker build -t cyclosm-tile-server -f Dockerfile .; then
    echo "Docker image built successfully"
else
    echo "ERROR: Failed to build Docker image"
    exit 1
fi

# Step 2: Create Docker volume for PostgreSQL database
echo -e "\nCreating Docker volume for OSM data...\n"
if docker volume inspect osm-data >/dev/null 2>&1; then
    echo "WARNING: Docker volume 'osm-data' already exists"
else
    if docker volume create osm-data; then
        echo "Docker volume 'osm-data' created successfully"
    else
        echo "ERROR: Failed to create Docker volume 'osm-data'"
        exit 1
    fi
fi

# Step 3: Import OSM data
echo -e "\nImporting OSM data into PostgreSQL database..."
echo "WARNING: This process may take a long time depending on the size of your OSM file"
echo "Import started at: $(date)"

if docker run \
    -v "$OSM_PBF_FILE:/data/region.osm.pbf" \
    -v osm-data:/data/database/ \
    -v osm-tiles:/data/tiles/ \
    cyclosm-tile-server import; then
    echo "OSM data imported successfully"
    echo "Import completed at: $(date)"
else
    echo "ERROR: Failed to import OSM data"
    exit 1
fi

# Display completion message and next steps
echo
echo "=== CyclOSM Tile Server Setup Complete ==="
echo
echo "Your tile server is now ready to run!"
echo
echo "To start the server, run:"
echo "  docker run -p 8080:80 -v osm-data:/data/database/ -v osm-tiles:/data/tiles/ -d cyclosm-tile-server run"
echo
echo "Or use docker-compose:"
echo "  docker-compose up -d"
echo
echo "Once running, your tiles will be available at:"
echo "  http://localhost:8080/tile/{z}/{x}/{y}.png"
echo
echo "Demo map will be available at:"
echo "  http://localhost:8080"
echo
echo "WARNING: Initial tile rendering may take some time for larger zoom levels"