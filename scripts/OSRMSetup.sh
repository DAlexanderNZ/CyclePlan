#!/bin/bash
# Find downloaded OSM PBF file or prompt for download
# If more than one found, merge them with osmosis
set -e

OSM_PBF_FILES=( $(find . .. -maxdepth 1 -name "*.osm.pbf") )

if [ ${#OSM_PBF_FILES[@]} -eq 0 ]; then
    echo "No OSM PBF file found. Please download one from https://download.geofabrik.de/"
    exit 1
elif [ ${#OSM_PBF_FILES[@]} -gt 1 ]; then
    echo "Multiple OSM PBF files found. Merging them with osmium..."
    osmium merge "${OSM_PBF_FILES[@]}" -o merged.osm.pbf
    OSM_PBF_FILE="merged.osm.pbf"
else
    OSM_PBF_FILE="${OSM_PBF_FILES[0]}"
fi

# Strip leading path and file extension
OSM_PBF_FILE="${OSM_PBF_FILE#./}"
OSM_BASE="${OSM_PBF_FILE%.osm.pbf}"

# Extract and partition the OSM PBF file
# If you want to customize the routing profile, you can modify the profile file at /opt/bicycle.lua
echo "Using OSM PBF file: ${OSM_PBF_FILE}"
echo -e "Running osrm-extract...\n"
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/bicycle.lua /data/${OSM_PBF_FILE} || echo "osrm-extract failed"

echo -e "\nRunning osrm-partition...\n"
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/${OSM_PBF_FILE} || echo "osrm-partition failed"
echo -e "\nRunning osrm-customize...\n"
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/${OSM_PBF_FILE} || echo "osrm-customize failed"

echo -e "\nOSRM setup complete.\n"
echo "You can now start the OSRM server using the following command:"
echo -e "docker run -t -v \"${PWD}:/data\" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/${OSM_BASE}.osrm "
