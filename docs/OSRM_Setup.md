## Open Source Routing Machine (OSRM) Setup

We use a locally hosted instance of [OSRM](https://github.com/Project-OSRM/osrm-backend/tree/master) to provide our routing service.
OSRM precomputes routing data from OSM PBF files. So setup can take a while depending on the size of the OSM PBF file, but once setup is complete, it is quick as serving requests.

Based on my testing [below](#notes), I would recommend limiting your chosen map to a limited country or sub region due to the scaling RAM requirements of OSRM. Feel free to download multiple PBF files, the script will merge them for you.

If you want to use a customized OSRM profile, you can change the osrm-extract `-p` path command in OSRMSetup.sh

### Dependencies

- Docker
- [OSM PBF](https://download.geofabrik.de/) file for your region
- [osmium](https://wiki.openstreetmap.org/wiki/Osmium) if want to use multiple OSM PBF files. E.g New Zealand and Australia but not the rest of Oceania

### Setup

```bash
./OSRMSetup.sh
```

To modify the routing profile, you can edit the profile file [bicycle.lua](https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/bicycle.lua). This allows you to customize the routing behavior according to your needs. After making changes to the profile file, you will need to re-run the `osrm-extract` and `osrm-partition` steps to apply the new routing profile.


## Notes
- The OSRM github wiki has a page on [Disk and Memory requirements](https://github.com/Project-OSRM/osrm-backend/wiki/Disk-and-Memory-Requirements) regarding car and foot from 2021, but it doesn't seem to be of much help regarding cycling or much relation to my testing of smaller regions.
- When testing with Australia and New Zealand OSM PBF files osrm-extract failed in a VM with 8GB of RAM, but worked once RAM was increased to 16GB.
- North America failed with upto 160GB of RAM. Unable to get osrm-extract to complete.
### Performance
Basic time taken of the script with the default OSRM bicycle profile, tested on Ubuntu Server 24.04 VM with 4 Xeon E5-2680v3 cores and RAM as per the table.
| Countries | Time Taken | RAM Required | File Size |
|-----------|------------|--------------|-----------|
| [Australia](https://download.geofabrik.de/australia-oceania/australia.html) & [New Zealand](https://download.geofabrik.de/australia-oceania/new-zealand.html) | 15min | 16GB | 1.2GB |
| [Australia-Oceania](https://download.geofabrik.de/australia-oceania.html) | 16min | 16GB | 1.4GB |
| [Britain and Ireland](https://download.geofabrik.de/europe/britain-and-ireland.html) | 38min | 24GB | 2.2GB |
| [us-west](https://download.geofabrik.de/north-america/us-west.html) | 52min | 40GB | 3.0GB |
| [France](https://download.geofabrik.de/europe/france.html) | 67min | 40GB | 4.5GB |
| [North America](https://download.geofabrik.de/north-america.html) - Failed | 61min | 160GB | 17GB |
