## Open Source Routing Machine (OSRM) Setup

We use a locally hosted instance of [OSRM](https://github.com/Project-OSRM/osrm-backend/tree/master) to provide our routing service.
OSRM precomputes routing data from OSM PBF files. So setup can take a while depending on the size of the OSM PBF file, but once setup is complete, it is quick as serving requests.

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
- When testing with Australia and New Zealand OSM PBF files osrm-extract failed in a VM with 8GB of RAM, but worked once RAM was increased to 16GB.
- With a VM with 4 Xeon E5-2680v3 cores and 16GB of RAM on Ubuntu 24.04 the script took ~15min to process Australia and New Zealand OSM PBF files.