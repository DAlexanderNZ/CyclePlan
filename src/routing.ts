/// <reference types="leaflet" />

import type { AppState } from './types';

declare const L: typeof import('leaflet');

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

export async function fetchOsrmRoute(waypoints: L.LatLng[], osrmUrl: string): Promise<{route: any, profile: string} | null> {
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
    const url = `${osrmUrl}route/v1/${profile}/${coords}?${params}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            const errorText = await res.text();
            console.error('OSRM server error, status:', res.status, 'Response:', errorText);
            throw new Error(`OSRM server returned status ${res.status}: ${errorText}`);
        }
        const data = await res.json();
        if (data && data.routes && data.routes.length) {
            return {route: data.routes[0], profile};
        } else {
            throw new Error('No route found in response');
        }
    } catch (err) {
        console.error('Fetch error:', err);
        throw new Error('Routing failed: ' + (err as Error).message);
    }
}

// Draw route as red polyline on the routePane
export function drawRoute(geojson: any, routeLayer: L.LayerGroup, map: L.Map, insertWaypointAtBestPosition: (point: L.LatLng) => Promise<void>): void {
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
                            insertWaypointAtBestPosition(dragPoint);
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
