/// <reference types="leaflet" />

import L from 'leaflet';
import type { AppState } from './types';

export async function snapToNearestRoad(latlng: L.LatLng, osrmUrl: string): Promise<L.LatLng | null> {
    const url = `${osrmUrl}nearest/v1/cycling/${latlng.lng},${latlng.lat}?number=1`;
    console.log('Snapping URL:', url); // Debug log
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn('Failed to snap to road, status:', res.status);
            return null;
        }
        const data = await res.json();
        if (data && data.waypoints && data.waypoints.length > 0) {
            const waypoint = data.waypoints[0];
            const snapped = L.latLng(waypoint.location[1], waypoint.location[0]);
            return snapped;
        }
        return null;
    } catch (err) {
        console.warn('Road snapping failed:', err);
        return null;
    }
}

export async function fetchOsrmRoute(waypoints: L.LatLng[], osrmUrl: string, isRoundTrip: boolean = false): Promise<{route: any, profile: string} | null> {
    if (waypoints.length < 2) {
        return null;
    }
    
    // Validate waypoints
    const validWaypoints = waypoints.filter(point => 
        point && typeof point.lat === 'number' && typeof point.lng === 'number' &&
        !isNaN(point.lat) && !isNaN(point.lng)
    );
    
    if (validWaypoints.length < 2) {
        console.error('Not enough valid waypoints:', waypoints);
        throw new Error('Invalid waypoints provided');
    }
    
    const coords = validWaypoints.map(point => `${point.lng},${point.lat}`).join(';');
    const params = 'overview=full&geometries=geojson&steps=false';
    const profile = 'cycling';

    // For round trips we use the Route service and append the first coordinate
    // as the final waypoint. We don't use the OSRM Trip service here because
    // Trip may reorder intermediate waypoints to optimize the tour (TSP).
    // That reordering breaks use-cases where the user expects points to be
    // visited in the same sequence they were placed (for example: out-and-back
    // along the same cycleway). Appending the start as the last point forces
    // the route service to build an explicit round-trip that preserves input
    // ordering while returning to the start.
    if (isRoundTrip && validWaypoints.length >= 3) {
        // Build coords with the first point appended as the final coordinate
        const first = validWaypoints[0]!;
        const coordsWithReturn = coords + ';' + `${first.lng},${first.lat}`;
        const url = `${osrmUrl}route/v1/${profile}/${coordsWithReturn}?${params}`;
        try {
            const res = await fetch(url);
            if (!res.ok) {
                const errorText = await res.text();
                console.error('OSRM route server error (roundtrip), status:', res.status, 'Response:', errorText);
                throw new Error(`OSRM route server returned status ${res.status}: ${errorText}`);
            }
            const data = await res.json();
            if (data && data.routes && data.routes.length) {
                return {route: data.routes[0], profile};
            } else {
                throw new Error('No route found in response for roundtrip');
            }
        } catch (err) {
            console.error('Fetch route (roundtrip) error:', err);
            throw new Error('Roundtrip routing failed: ' + (err as Error).message);
        }
    }

    // Regular route service for point-to-point
    const url = `${osrmUrl}route/v1/${profile}/${coords}?${params}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            const errorText = await res.text();
            console.error('OSRM server error, status:', res.status, 'Response:', errorText);
            throw new Error(`OSRM server returned status ${res.status}: ${errorText}`);
        }
        const data = await res.json();
        if (data && data.routes && data.routes.length && data.routes[0]) {
            return {route: data.routes[0], profile};
        } else {
            throw new Error('No valid route found in response');
        }
    } catch (err) {
        console.error('Fetch error:', err);
        throw new Error('Routing failed: ' + (err as Error).message);
    }
}

// Draw route as red polyline on the routePane
export function drawRoute(geojson: any, routeLayer: L.LayerGroup, map: L.Map, insertWaypointAtBestPosition: (dropPoint: L.LatLng, anchorPoint: L.LatLng, polyline?: L.Polyline | null) => Promise<void>, onHoverDistance?: (meters: number | null) => void): void {
    // Clear previous route
    routeLayer.clearLayers();
    if (geojson) {
        const routeGeo = L.geoJSON(geojson, {
            style: {color: 'red', weight: 5, opacity: 0.9},
            pane: 'routePane'
        });
        
        // Make route interactive for adding waypoints by dragging
        routeGeo.eachLayer(function(layer) {
            if (layer instanceof L.Polyline) {
                // Add mousedown event to start dragging new waypoint
                layer.on('mousedown', function(e) {
                    let dragPoint = e.latlng;
                    const anchorPoint = e.latlng;
                    let isDragging = false;
                    let tempMarker: L.Marker | null = null;
                    
                    // Prevent default map dragging
                    map.dragging.disable();
                    
                    // Create temporary marker
                    tempMarker = L.marker(dragPoint, {
                        icon: L.divIcon({
                            className: 'temp-drag-marker',
                            html: '<div style="background: orange; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        }),
                        pane: 'markerPane'
                    }).addTo(map);
                    
                    // Mouse move handler
                    function onMouseMove(moveEvent: L.LeafletMouseEvent) {
                        isDragging = true;
                        if (tempMarker) {
                            tempMarker.setLatLng(moveEvent.latlng);
                        }
                        dragPoint = moveEvent.latlng;
                    }
                    
                    // Mouse up handler
                    function onMouseUp() {
                        map.off('mousemove', onMouseMove);
                        map.off('mouseup', onMouseUp);
                        if (tempMarker) {
                            map.removeLayer(tempMarker);
                        }
                        map.dragging.enable();
                        
                        if (isDragging) {
                            // Find the best position to insert the new waypoint
                            insertWaypointAtBestPosition(dragPoint, anchorPoint, layer as L.Polyline);
                        }
                    }
                    
                    map.on('mousemove', onMouseMove);
                    map.on('mouseup', onMouseUp);
                    
                    L.DomEvent.stopPropagation(e);
                    return false;
                });
            }
        });
        
        routeGeo.addTo(routeLayer);
        
        // Enable pointer events and cursor style after adding to map
        setTimeout(() => {
            routeGeo.eachLayer(function(layer) {
                if (layer instanceof L.Polyline) {
                    const element = (layer as any).getElement();
                    if (element) {
                        element.style.pointerEvents = 'auto';
                        element.style.cursor = 'crosshair';
                    }
                }
            });
        }, 50);

        // Attach hover handlers to show distance from start at mouse position
        routeGeo.eachLayer(function(layer) {
            if (layer instanceof L.Polyline) {
                const poly = layer as L.Polyline;
                // Persistent marker for last-hovered position
                let hoverMarker: L.Marker | null = null;
                // Marker while moving
                let tempHoverMarker: L.Marker | null = null;

                async function onMouseMove(e: L.LeafletMouseEvent) {
                    try {
                        const latlngsRaw = (poly.getLatLngs() as any) || [];
                        const latlngs: L.LatLng[] = flattenLatLngs(latlngsRaw);
                        if (latlngs.length < 2) return;
                        const projMeters = distanceAlongPolyline(latlngs, e.latlng, map);
                        // create or move temporary hover marker
                        // remove existing persistent marker while moving
                        if (hoverMarker) {
                            routeLayer.removeLayer(hoverMarker);
                            hoverMarker = null;
                        }

                        if (!tempHoverMarker) {
                            tempHoverMarker = L.marker(e.latlng, {
                                icon: L.divIcon({
                                    className: 'hover-marker-temp',
                                    html: '<div style="background: #007cba; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>',
                                    iconSize: [10,10],
                                    iconAnchor: [5,5]
                                }),
                                pane: 'markerPane',
                                interactive: false
                            }).addTo(routeLayer);
                        } else {
                            tempHoverMarker.setLatLng(e.latlng);
                        }

                        if (onHoverDistance) onHoverDistance(projMeters);
                        else {
                            const km = (projMeters / 1000);
                            const el = document.getElementById('hoverDistance');
                            if (el) {
                                el.textContent = `Distance from start: ${km.toFixed(2)} km`;
                                el.style.display = 'inline';
                            }
                        }
                    } catch (err) {
                        console.error('Error computing hover distance:', err);
                    }
                }

                poly.on('mousemove', onMouseMove);
                poly.on('mouseover', function() {
                    // Ensure hover display is visible when entering the polyline
                    if (onHoverDistance) return; // callback consumer handles visibility
                    const el = document.getElementById('hoverDistance');
                    if (el) el.style.display = 'inline';
                });

                poly.on('mouseout', function(e: L.LeafletMouseEvent) {
                    // When mouse leaves the polyline, remove temporary marker and leave a persistent hoverMarker
                    if (tempHoverMarker) {
                        const lat = tempHoverMarker.getLatLng();
                        // remove temp marker
                        routeLayer.removeLayer(tempHoverMarker);
                        tempHoverMarker = null;

                        // create or move persistent marker to last position
                        if (!hoverMarker) {
                            hoverMarker = L.marker(lat, {
                                icon: L.divIcon({
                                    className: 'hover-marker',
                                    html: '<div style="background: #007cba; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                                    iconSize: [12,12],
                                    iconAnchor: [6,6]
                                }),
                                pane: 'markerPane'
                            }).addTo(routeLayer);

                            // clicking the persistent marker removes it and clears hover display
                            hoverMarker.on('click', () => {
                                routeLayer.removeLayer(hoverMarker!);
                                hoverMarker = null;
                                if (onHoverDistance) onHoverDistance(null);
                            });
                        } else {
                            hoverMarker.setLatLng(lat);
                        }
                    }
                    // Keep hover distance visible for the persistent marker
                    if (onHoverDistance) {
                        // do nothing: last value remains shown
                    } else {
                        // already handled by hideHover
                    }
                });
            }
        });
    }
}

export function getDistanceToLineSegment(point: L.LatLng, lineStart: L.LatLng, lineEnd: L.LatLng): number {
    const A = point.lat - lineStart.lat;
    const B = point.lng - lineStart.lng;
    const C = lineEnd.lat - lineStart.lat;
    const D = lineEnd.lng - lineStart.lng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;

    let xx, yy;

    if (param < 0) {
        xx = lineStart.lat;
        yy = lineStart.lng;
    } else if (param > 1) {
        xx = lineEnd.lat;
        yy = lineEnd.lng;
    } else {
        xx = lineStart.lat + param * C;
        yy = lineStart.lng + param * D;
    }

    const dx = point.lat - xx;
    const dy = point.lng - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

// Flatten nested latlng arrays (GeoJSON MultiLineString may produce nested arrays)
export function flattenLatLngs(raw: any): L.LatLng[] {
    const out: L.LatLng[] = [];
    if (!raw) return out;
    if (Array.isArray(raw)) {
        raw.forEach((item) => {
            if (item instanceof L.LatLng) out.push(item);
            else if (Array.isArray(item) && item.length && item[0] instanceof L.LatLng) {
                (item as L.LatLng[]).forEach(x => out.push(x));
            } else if (Array.isArray(item)) {
                // nested deeper
                (flattenLatLngs(item) as L.LatLng[]).forEach(x => out.push(x));
            }
        });
    }
    return out;
}

// Compute distance along the polyline from the start to the projection of `point` onto the polyline
export function distanceAlongPolyline(latlngs: L.LatLng[], point: L.LatLng, map: L.Map): number {
    // Convert to meters using map.distance
    let total = 0;
    let nearest = {dist: Infinity, index: -1, t: 0, projLatLng: null as L.LatLng | null};

    for (let i = 0; i < latlngs.length - 1; i++) {
        const a = latlngs[i];
        const b = latlngs[i + 1];
        if (!a || !b) continue;
        // Project point onto segment in lat/lng space using simple linear projection
        const proj = projectPointToSegment(point, a, b);
        const d = map.distance(proj.latlng, point);
        if (d < nearest.dist) {
            nearest = {dist: d, index: i, t: proj.t, projLatLng: proj.latlng};
        }
    }

    if (nearest.index === -1 || !nearest.projLatLng) return 0;

    // Sum distances up to the segment
    for (let i = 0; i < nearest.index; i++) {
        const a = latlngs[i];
        const b = latlngs[i + 1];
        if (!a || !b) continue;
        total += map.distance(a, b);
    }

    // Add partial distance on the segment
    const segStart = latlngs[nearest.index];
    const segProj = nearest.projLatLng;
    if (segStart && segProj) {
        total += map.distance(segStart, segProj);
    }

    return total;
}

// Project a point to the closest point on the segment (a-b) and return the projected latlng and param t
export function projectPointToSegment(p: L.LatLng, a: L.LatLng, b: L.LatLng): {latlng: L.LatLng, t: number} {
    // Work in simple Cartesian lat/lng coordinates — fine for short distances
    const A = p.lat - a.lat;
    const B = p.lng - a.lng;
    const C = b.lat - a.lat;
    const D = b.lng - a.lng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : 0;

    let xx, yy;
    let t = param;
    if (param < 0) {
        xx = a.lat; yy = a.lng; t = 0;
    } else if (param > 1) {
        xx = b.lat; yy = b.lng; t = 1;
    } else {
        xx = a.lat + param * C;
        yy = a.lng + param * D;
    }

    return { latlng: L.latLng(xx, yy), t };
}
