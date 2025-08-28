/// <reference types="leaflet" />

interface Config {
    thunderApiKey: string;
    osrmAddress: string;
}

// Configuration variables (loaded dynamically)
let THUNDER_API_KEY: string;
let OSRM_ADDRESS: string;
let OSRM_URL: string;

declare const L: typeof import('leaflet');

// Global variables
let map: L.Map;
let routeLayer: L.LayerGroup;
let routingPoints: L.LatLng[] = [];
let routingMarkers: L.Marker[] = [];
let currentRouteDistance: number = 0; // Distance in meters

async function loadConfig(): Promise<Config> {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        const config: Config = await response.json();
        
        // Validate required fields
        if (!config.thunderApiKey || config.thunderApiKey === 'YOUR_THUNDERFOREST_API_KEY_HERE') {
            throw new Error('Please set your Thunderforest API key in config.json');
        }
        if (!config.osrmAddress || config.osrmAddress === 'YOUR_OSRM_SERVER_ADDRESS_HERE') {
            throw new Error('Please set your OSRM server address in config.json');
        }
        
        return config;
    } catch (error) {
        console.error('Configuration error:', error);
        alert('Configuration error: ' + (error as Error).message + '\n\nPlease copy config.template.json to config.json and fill in your API keys and server addresses.');
        throw error;
    }
}

// Initialize the map when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const config = await loadConfig();
        THUNDER_API_KEY = config.thunderApiKey;
        OSRM_ADDRESS = config.osrmAddress;
        OSRM_URL = `http://${OSRM_ADDRESS}/`;
        
        initializeMap();
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
});

function initializeMap(): void {
    console.log("Map script loaded");
    map = L.map('map').setView([-43.531, 172.62], 15);
    L.tileLayer(`https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=${THUNDER_API_KEY}`, {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // Create a high-z pane so the route draws on top of roads/tiles
    const routePane = map.createPane('routePane');
    routePane.style.zIndex = '650';
    // Disable pointer events so it doesn't block map interactions
    routePane.style.pointerEvents = 'none';

    // Create an even higher pane for markers so they appear above the route
    const markerPane = map.createPane('markerPane');
    markerPane.style.zIndex = '700';

    // Layer group to keep route / markers organized
    routeLayer = L.layerGroup().addTo(map);

    // Set up event handlers
    setupEventHandlers();
    
    // Initialize UI
    updatePointCount();
    updateDistanceDisplay();
    addInfoControl();
}

function updatePointCount(): void {
    const pointCountElement = document.getElementById('pointCount');
    if (pointCountElement) {
        pointCountElement.textContent = `Points: ${routingPoints.length}`;
    }
}

function updateDistanceDisplay(): void {
    const distanceElement = document.getElementById('routeDistance');
    if (distanceElement) {
        if (currentRouteDistance > 0 && currentRouteDistance < 1000) {
            const meters = currentRouteDistance;
            distanceElement.textContent = `Route Distance: ${meters} m`;
        } else if (currentRouteDistance >= 1000) {
            const km = (currentRouteDistance / 1000).toFixed(2);
            distanceElement.textContent = `Route Distance: ${km} km`;
        } else {
            distanceElement.textContent = 'Route Distance: 0 km';
        }
    }
}

function createNumberedMarker(latlng: L.LatLng, number: number): L.Marker {
    const marker = L.marker(latlng, {
        draggable: true,
        pane: 'markerPane',
        icon: L.divIcon({
            className: 'numbered-marker',
            html: `<div class="marker-number">${number}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    });
    
    // Store the point index for easy removal
    (marker as any).pointIndex = number - 1;
    
    // Add drag event handlers
    marker.on('dragstart', function(e: L.LeafletEvent) {
        // Prevent map click events during drag
        map.off('click');
    });
    
    marker.on('dragend', async function(e: L.LeafletEvent) {
        const newLatLng = (e.target as L.Marker).getLatLng();
        const snappedPoint = await snapToNearestRoad(newLatLng);
        
        if (snappedPoint) {
            // Update the marker position to snapped location
            (e.target as L.Marker).setLatLng(snappedPoint);
            // Update the routing points array
            routingPoints[(marker as any).pointIndex] = snappedPoint;
        } else {
            // If snapping fails, use the dragged position
            routingPoints[(marker as any).pointIndex] = newLatLng;
        }
        
        // Update the route
        updateRoute();
        
        // Re-enable map click events after a short delay
        setTimeout(() => {
            map.on('click', function(e: L.LeafletMouseEvent) {
                addRoutingPoint(e.latlng);
            });
        }, 100);
    });
    
    return marker;
}

function redrawMarkers(): void {
    // Clear existing markers
    routingMarkers.forEach(marker => map.removeLayer(marker));
    routingMarkers = [];
    
    // Create new numbered markers
    routingPoints.forEach((point, index) => {
        const marker = createNumberedMarker(point, index + 1);
        marker.addTo(map);
        routingMarkers.push(marker);
    });
}

async function snapToNearestRoad(latlng: L.LatLng): Promise<L.LatLng | null> {
    const url = `${OSRM_URL}nearest/v1/cycling/${latlng.lng},${latlng.lat}?number=1`;
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

async function fetchOsrmRoute(waypoints: L.LatLng[]): Promise<{route: any, profile: string} | null> {
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
    const url = `${OSRM_URL}route/v1/${profile}/${coords}?${params}`;
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
function drawRoute(geojson: any): void {
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

// Find the closest road position to user click to insert a new waypoint 
async function insertWaypointAtBestPosition(newPoint: L.LatLng): Promise<void> {
    if (routingPoints.length < 2) return;
    
    let bestIndex = 1; // Insert after first point by default
    let minDistance = Infinity;
    
    // Find which segment the new point is closest to
    for (let i = 0; i < routingPoints.length - 1; i++) {
        const segmentStart = routingPoints[i];
        const segmentEnd = routingPoints[i + 1];
        
        if (segmentStart && segmentEnd) {
            // Calculate distance from point to line segment
            const distance = getDistanceToLineSegment(newPoint, segmentStart, segmentEnd);
            
            if (distance < minDistance) {
                minDistance = distance;
                bestIndex = i + 1;
            }
        }
    }
    
    // Snap the new point to the nearest road
    const snappedPoint = await snapToNearestRoad(newPoint);
    const pointToInsert = snappedPoint || newPoint;
    
    // Insert the new waypoint at the best position
    routingPoints.splice(bestIndex, 0, pointToInsert);
    redrawMarkers();
    updatePointCount();
    updateRoute();
}

function getDistanceToLineSegment(point: L.LatLng, lineStart: L.LatLng, lineEnd: L.LatLng): number {
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

async function updateRoute(): Promise<void> {
    if (routingPoints.length < 2) {
        // Clear route if less than 2 points
        routeLayer.clearLayers();
        currentRouteDistance = 0;
        updateDistanceDisplay();
        return;
    }
    
    console.log('Updating route with points:', routingPoints);
    
    try {
        const result = await fetchOsrmRoute(routingPoints);
        if (result) {
            console.log('OSRM profile used:', result.profile);
            drawRoute(result.route.geometry);
            
            // Extract and store the route distance
            currentRouteDistance = result.route.distance || 0;
            updateDistanceDisplay();
        } else {
            console.warn('No route result returned');
            routeLayer.clearLayers();
            currentRouteDistance = 0;
            updateDistanceDisplay();
        }
    } catch (err) {
        console.error('Routing failed:', err);
        console.error('Error details:', (err as Error).message);
        console.error('Stack trace:', (err as Error).stack);
        currentRouteDistance = 0;
        updateDistanceDisplay();
    }
}

async function addRoutingPoint(latlng: L.LatLng): Promise<void> {
    console.log('Adding point at:', latlng); // Debug log
    
    // Show a temporary marker at click location
    const tempMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'temp-marker',
            html: '<div style="background: orange; width: 8px; height: 8px; border-radius: 50%;"></div>',
            iconSize: [8, 8],
            iconAnchor: [4, 4]
        })
    }).addTo(map);
    
    // Snap the new point to the nearest road
    const snappedPoint = await snapToNearestRoad(latlng);
    const pointToAdd = snappedPoint || latlng;
    
    // Remove temp marker
    map.removeLayer(tempMarker);
    
    console.log('Point to add:', pointToAdd); // Debug log
    if (snappedPoint) {
        console.log('Snapped from', latlng, 'to', snappedPoint);
    } else {
        console.log('No snapping occurred, using original point');
    }
    
    routingPoints.push(pointToAdd);
    redrawMarkers();
    updatePointCount();
    updateRoute();
}

// Remove a routing point by index
function removeRoutingPoint(index: number): void {
    if (index >= 0 && index < routingPoints.length) {
        routingPoints.splice(index, 1);
        redrawMarkers();
        updatePointCount();
        updateRoute();
    }
}

// Reset all routing points
function resetRoute(): void {
    routingPoints = [];
    routingMarkers.forEach(marker => map.removeLayer(marker));
    routingMarkers = [];
    routeLayer.clearLayers();
    currentRouteDistance = 0;
    updatePointCount();
    updateDistanceDisplay();
}

function setupEventHandlers(): void {
    // Left click to add routing point
    map.on('click', function(e) {
        addRoutingPoint(e.latlng);
    });

    // Right click on map to remove nearest point (within reasonable distance)
    map.on('contextmenu', function(e) {
        const clickPoint = e.latlng;
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        const maxDistance = 50; // Maximum distance in meters to consider for removal
        
        routingPoints.forEach((point, index) => {
            const distance = map.distance(clickPoint, point);
            if (distance < nearestDistance && distance < maxDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });
        
        if (nearestIndex >= 0) {
            removeRoutingPoint(nearestIndex);
        }
    });

    // Reset button event handler
    const resetButton = document.getElementById('resetRoute');
    if (resetButton) {
        resetButton.addEventListener('click', resetRoute);
    }
}

// Add info control to the map
function addInfoControl(): void {
    const info = new L.Control({position: 'topright'});
    info.onAdd = function () {
        const div = L.DomUtil.create('div', 'route-info');
        div.innerHTML = '<strong>Cycle Route Planner</strong><br>' +
                       'Left-click to add routing points<br>' +
                       'Drag points to move them (snaps to roads)<br>' +
                       'Drag on route line to add new waypoints<br>' +
                       'Right-click near a point to remove it<br>' +
                       'Use Reset button to clear route';
        div.style.background = 'white';
        div.style.padding = '6px 8px';
        div.style.boxShadow = '0 1px 4px rgba(0,0,0,0.65)';
        div.style.fontSize = '12px';
        div.style.lineHeight = '1.4';
        return div;
    };
    info.addTo(map);
}
