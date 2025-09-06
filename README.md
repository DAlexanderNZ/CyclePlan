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

After cloning the repository, setup routing with OSRM and then you have two options for map tiles.

1. [Setup OSRM routing server](docs/OSRM_Setup.md)

### Option 1: Using Local Tile Service (Recommended for offline use)

2. Setup local tile service

### Option 2: Using Thunderforest (External service)

2. Get a free API key from [Thunderforest](https://www.thunderforest.com/)

### Run the interactive setup script
3. Run the interactive setup script:
   ```bash
   bun run setup
   ```
   - Choose option 1 for local tiles or option 2 for Thunderforest
   - Enter your local tile server URL (default: http://localhost:8080) if using local tiles
   - Enter your Thunderforest API key if using Thunderforest
   - Enter your OSRM server address (default: localhost:5000)

### Starting the Application

4. Start the development server:
   ```bash
   bun run server
   ```
