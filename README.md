# CyclePlan

A self hosted cycling route planning map web application.

## Features
- [x] Offline routing with OSRM
- Mapping
    - [x] Hosted map tiles (Thunderforest)
    - [x] Locally hosted map tiles
- [x] Save and manage routes
- Export Routes
    - [ ] To your preferred file format
    - [ ] To your device
- [ ] Elevation Profiles
- [ ] Route Surface Details

## Dependencies
- Docker
- [Bun](https://bun.com/)

## Setup
After cloning the repository, follow these steps:

1. [Setup OSRM routing server](docs/OSRM_Setup.md)

2. **Choose your map tile option:**

### Option 1: Using Local Tile Service (Recommended for offline use)
>[!NOTE]
> Depending on the size of your chosen OSM PBF file, the initial setup of the tile server can take a significant amount of time and disk space. [Australia-Oceania](https://download.geofabrik.de/australia-oceania.html) 1.4GB PBF file used over 60GB of disk durring setup.

[cycle-tile-server](cycle-tile-server/README.md) is a docker container that renders and serves map tiles locally. It is a Git subtree in this repo and can also be found [here](https://github.com/DAlexanderNZ/cyclosm-tile-server).

The tile server will use the same `osm.pbf` file or `merged.osm.pbf` file from the OSRM, so your routable and renderables should match and are based on the same OSM data.

Setup local tile service:
```bash
./scripts/tileServer.sh
```

### Option 2: Using Thunderforest (External service)
Get an API key from [Thunderforest](https://www.thunderforest.com/)

### Bring up backend services

3. Start the required backend services:
   ```bash
   # Start all services (OSRM + Tile Server)
   bun run services:start
   
   # Or start only OSRM
   bun run osrm:start
   
   # Or start only tile server (if using local tiles)
   bun run tiles:start
   ```

   **Service Management Commands:**
   ```bash
   # Stop all services
   bun run services:stop
   
   # Restart services
   bun run services:restart
   
   # Check service status
   bun run services:status
   
   # View logs
   bun run services:logs
   ```

   The services will be available at:
   - OSRM: http://localhost:5000
   - Tile Server: http://localhost:8080 (if using local tiles)

### Install Frontend Dependencies

4. Ensure you have Bun installed. Then, install the frontend dependencies:
```bash
bun install
```

### Run the interactive setup script

5. Run the interactive setup script:
   ```bash
   bun run setup
   ```
   - Choose option 1 for local tiles or option 2 for Thunderforest
   - Enter your local tile server URL (default: http://localhost:8080) if using local tiles
   - Enter your Thunderforest API key if using Thunderforest
   - Enter your OSRM server address (default: localhost:5000)

## Starting the Application

6. Start the development server:
   ```bash
   bun run server
   ```

## Troubleshooting

### Service Management
- **Check service status**: `bun run services:status`
- **View service logs**: `bun run services:logs`
- **View specific service logs**: Use Docker directly: `docker compose logs -f osrm` or `docker compose logs -f tile-server`

### Common Issues
- **OSRM fails to start**: Ensure you've run the OSRM setup script and `.osrm` files exist in the project root
- **Tile server fails to start**: Make sure you've run the tile server setup script and Docker volumes are created
- **Port conflicts**: The default ports are 5000 (OSRM) and 8080 (tiles). Change them in `docker-compose.yml` if needed

### Manual Docker Commands
If you prefer using Docker directly:
```bash
# Find your OSRM file
ls *.osrm

# Start OSRM manually (replace 'your-file' with actual filename)
docker run -d -t -i -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/your-file.osrm

# Start tile server manually
cd cyclosm-tile-server
docker compose up -d
```
