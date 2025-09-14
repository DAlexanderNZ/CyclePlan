// Converting to and from GPX to route waypoints 

const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser");
import simplify from "simplify-js";

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
            "@version": "1.1", "@creator": "CyclePlan https://github.com/DAlexanderNZ/CyclePlan",
            "@xsi:schemaLocation": "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/11.xsd",
            "@xmlns": "http://www.topografix.com/GPX/1/1",
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
 * @param threshold Threshold value (degrees for bearing/douglas/simplify, area for visvalingam)
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