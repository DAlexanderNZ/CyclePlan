import { XMLParser, XMLBuilder, XMLValidator} from "fast-xml-parser";
import simplify from "simplify-js";
import type { SavedRoute } from "./types";
import L from "leaflet";

/** Precision levels for trimming trackpoints measured in degrees. 
 * 0.00001 degrees is approximately 1.11 meters.
 * 
 * Removes trackpoints based on the amount of simplification (in the same metric as the point coordinates).
 * Lower precision = less trackpoints = smaller file size
 * @property {number} ORIGINAL - No trimming, original trackpoints
 * @enum {number}
 */
enum Precision {
    LOW = 0.0008,
    MEDIUM = 0.0002,
    HIGH = 0.00006,
    VERYHIGH = 0.00001,
    ORIGINAL = 0
}

/** Build GPX xml document from OSRM JSON 
 * @param routeData Either a single OSRM route JSON object or an array of {name, routejson} objects
 * @param waypoints Include waypoints in GPX output
 * @param threshold Threshold value
 * @returns GPX XML string
*/
export function buildGPX(routeData: any | {name: string, routejson: any}[], waypoints: boolean = false, threshold: Precision = Precision.VERYHIGH) { 
    const options = {
        ignoreAttributes: false,
        attributeNamePrefix: '@',
        format: true    
    };
    const builder = new XMLBuilder(options);

    // Handle single route or multiple routes
    const routes = Array.isArray(routeData) ? routeData : [{name: "Route", routejson: routeData}];

    // Transform OSRM JSON to GPX structure
    const gpxData = {
        "?xml": { "@version": "1.0", "@encoding": "UTF-8" },
        "gpx": {
            "@creator": "CyclePlan https://github.com/DAlexanderNZ/CyclePlan", "@version": "1.1",
            "@xsi:schemaLocation": "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd",
            "@xmlns": "http://www.topografix.com/GPX/1/1",
            "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "trk": routes.map(route => {
                // Validate route structure
                if (!route.routejson.routes || !route.routejson.routes[0] || !route.routejson.routes[0].geometry || !route.routejson.routes[0].geometry.coordinates) {
                    console.warn('Invalid route structure for', route.name, route.routejson);
                    return null;
                }
                // Trim the track points to reduce file size
                const trimmedCoords = trimTrkpt(route.routejson.routes[0].geometry.coordinates, threshold);
                
                return {
                    "name": route.name,
                    "trkseg": {
                        "trkpt": trimmedCoords.map((coord: number[]) => ({
                            "@lat": coord[1], "@lon": coord[0]
                        }))
                    }
                };
            }).filter(track => track !== null)
        }
    };

    if (waypoints) {
        if (Array.isArray(routeData)) {
            // For multiple routes, add waypoints from each route
            const allWaypoints: any[] = [];
            routes.forEach(route => {
                if (route.routejson.waypoints) {
                    route.routejson.waypoints.forEach((w: any, index: number) => {
                        allWaypoints.push({
                            "@lat": w.location[1], 
                            "@lon": w.location[0],
                            "name": w.name || `${route.name} Point ${index + 1}`
                        });
                    });
                }
            });
            if (allWaypoints.length > 0) {
                (gpxData.gpx as any).wpt = allWaypoints;
            }
        } else {
            // Single route
            if (routeData.waypoints) {
                (gpxData.gpx as any).wpt = routeData.waypoints.map((w: any) => ({
                    "@lat": w.location[1], "@lon": w.location[0],
                    "name": w.name || ""
                }));
            }
        }
    }

    const xmlContent = builder.build(gpxData);

    // Validate the XML
    const validation = XMLValidator.validate(xmlContent);
    if (validation !== true) {
        throw new Error(`Invalid XML generated: ${JSON.stringify(validation)}`);
    }

    return xmlContent;
}

/** Trim track points to reduce number of points
 * @param coordinates Array of [lon, lat] coordinates
 * @param threshold Use Precision enum measured in degrees. 0.00001 degrees is approximately 1.11 meters.
 * @returns Trimmed array of [lon, lat] coordinates
 */
function trimTrkpt(coordinates: [number, number][], threshold: number): [number, number][] {
    if (threshold === Precision.ORIGINAL) {
        return coordinates;
    }
    const points = coordinates.map(([lon, lat]) => ({ x: lon, y: lat }));
    const simplified = simplify(points, threshold, true);
    return simplified.map(p => [p.x, p.y]);
}

/**
 * Trim GPX points to reduce route waypoint count for web services like OSRM
 * @param points Array of {lat,lng} points parsed from GPX
 * @param threshold Use Precision enum measured in degrees. 0.00001 degrees is approximately 1.11 meters.
 * @param maxPoints Needs to be under OSRM limit of 500 waypoints per request
 * @returns Trimmed array of {lat,lng} points
 */
function trimGPXPoints(points: any[], threshold: Precision, maxPoints: number): any[] {
    // Convert parsed {lat,lng} to [lon,lat] for trimming
    const coords = (points as any[]).map(p => [p.lng, p.lat] as [number, number]);

    if (coords.length > maxPoints && maxPoints > 0) {
        // Iteratively increase threshold until we drop under maxPoints or reach a reasonable cap
        let t = threshold;
        let trimmed = trimTrkpt(coords, t);
        const maxThreshold = 0.001; // ~111m
        while (trimmed.length > maxPoints && t < maxThreshold) {
            t = t * 2 || Precision.LOW; // increase threshold
            trimmed = trimTrkpt(coords, t);
        }
        return trimmed.map(c => ({ lat: c[1], lng: c[0] }));
    }

    return points as any;
}

/**
 * Generate a fallback route name with timestamp
 * @returns Default route name with timestamp
 */
function defaultRouteName(): string {
    const now = new Date();
    const date = now.toISOString().replace(/T/, ' ').replace(/Z$/, '');
    return `Imported Route ${date}`;
}

/**
 * Parse GPX content from a string and extract waypoints/trk points into a SavedRoute
 * @param gpxString GPX XML content
 * @param routeName Optional name to use for SavedRoute
 * @param threshold Threshold value for trimming trackpoints
 * @param maxPoints Maximum number of points to retain; OSRM has a limit of 500 waypoints per request, we default to 250
 * @returns SavedRoute object with points extracted as L.LatLng-like tuples
 */
export function parseGPXFromString(
    gpxString: string,
    routeName: string = defaultRouteName(),
    threshold: Precision = Precision.VERYHIGH,
    maxPoints: number = 250
): SavedRoute {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@',
        ignoreDeclaration: true,
        parseTagValue: false,
    });

    const parsed = parser.parse(gpxString);
    // GPX root may be `gpx`
    const gpx = parsed.gpx || parsed;

    const points: any[] = [];

    // Extract waypoints (wpt)
    if (gpx.wpt) {
        const wpts = Array.isArray(gpx.wpt) ? gpx.wpt : [gpx.wpt];
        wpts.forEach((w: any) => {
            const lat = parseFloat(w['@lat']);
            const lon = parseFloat(w['@lon']);
            if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
                points.push({ lat, lng: lon });
            }
        });
    }

    // Extract track points (trk > trkseg > trkpt)
    if (gpx.trk) {
        const trks = Array.isArray(gpx.trk) ? gpx.trk : [gpx.trk];
        trks.forEach((trk: any) => {
            if (!trk.trkseg) return;
            const segs = Array.isArray(trk.trkseg) ? trk.trkseg : [trk.trkseg];
            segs.forEach((seg: any) => {
                if (!seg.trkpt) return;
                const trkpts = Array.isArray(seg.trkpt) ? seg.trkpt : [seg.trkpt];
                trkpts.forEach((p: any) => {
                    const lat = parseFloat(p['@lat']);
                    const lon = parseFloat(p['@lon']);
                    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
                        points.push({ lat, lng: lon });
                    }
                });
            });
        });
    }

    const saved: SavedRoute = {
        id: `gpx-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        name: routeName,
        description: "Imported from GPX",
        points: trimGPXPoints(points, threshold, maxPoints).map(p => new L.LatLng(p.lat, p.lng)),
        distance: 0,
        created: new Date().toISOString(),
    };

    return saved;
}

/**
 * Read a File object (from an upload input) and return its text content.
 * Intended to run in the browser.
 */
export function readFileFromInput(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

/**
 * Convenience function to parse a File directly into a SavedRoute.
 */
export async function importGPX(file: File, routeName?: string, threshold: Precision = Precision.VERYHIGH, maxPoints: number = 250): Promise<SavedRoute> {
    const text = await readFileFromInput(file);
    return parseGPXFromString(text, routeName || file.name || "Imported Route", threshold, maxPoints);
}