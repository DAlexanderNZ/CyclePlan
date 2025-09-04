# CyclePlan

A self hosted cycling route planning map web application.

## Features
- [x] Offline routing  with OSRM
- Mapping
    - [x] Hosted map tiles
    - [ ] Locally hosted map tiles
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

After cloning the repository, you need to configure the API keys and server addresses:

1. [Setup OSRM routing server](docs/OSRM_Setup.md)

2. Run the interactive server setup script:
   ```bash
   bun run setup
   ```
   
   The setup script will prompt you for:
   - **Thunderforest API Key**: Get an API key from [Thunderforest](https://www.thunderforest.com/)
   - **OSRM Server Address**: Enter your OSRM server address (defaults to "localhost:5000")

3. Start the development server:
   ```bash
   bun run server
   ```
