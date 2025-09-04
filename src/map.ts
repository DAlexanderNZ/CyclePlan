/// <reference types="leaflet" />

interface Config {
    thunderApiKey: string;
    osrmAddress: string;
}

interface SavedRoute {
    id: string;
    name: string;
    description: string;
    points: L.LatLng[];
    distance: number;
    created: string;
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
let currentRenamingRouteId: string | null = null; // Track which route is being renamed

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

function setupTileCache(tileLayer: L.TileLayer): void {
    const TILE_CACHE_KEY = 'cycleplan_tile_cache';
    const CACHE_EXPIRY_HOURS = 84; // Cache tiles for 3.5 days
    const MAX_CACHE_SIZE_MB = 50; // Maximum cache size in MB
    
    // Get cached tiles from localStorage
    function getCachedTile(url: string): string | null {
        try {
            const cache = JSON.parse(localStorage.getItem(TILE_CACHE_KEY) || '{}');
            const cached = cache[url];
            
            if (cached && cached.timestamp) {
                const now = Date.now();
                const age = now - cached.timestamp;
                const maxAge = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
                
                if (age < maxAge) {
                    return cached.data;
                } else {
                    // Remove expired entry
                    delete cache[url];
                    localStorage.setItem(TILE_CACHE_KEY, JSON.stringify(cache));
                }
            }
        } catch (e) {
            console.warn('Error reading tile cache:', e);
        }
        return null;
    }
    
    // Cache a tile in localStorage
    function cacheTile(url: string, dataUrl: string): void {
        try {
            const cache = JSON.parse(localStorage.getItem(TILE_CACHE_KEY) || '{}');
            
            // Check cache size and clean if necessary
            const cacheSize = JSON.stringify(cache).length;
            const maxCacheSize = MAX_CACHE_SIZE_MB * 1024 * 1024;
            
            if (cacheSize > maxCacheSize) {
                // Remove oldest entries
                const entries = Object.entries(cache);
                entries.sort(([,a]: any, [,b]: any) => a.timestamp - b.timestamp);
                
                // Remove oldest 20% of entries
                const toRemove = Math.floor(entries.length * 0.2);
                for (let i = 0; i < toRemove; i++) {
                    const entry = entries[i];
                    if (entry && entry[0]) {
                        delete cache[entry[0]];
                    }
                }
            }
            
            cache[url] = {
                data: dataUrl,
                timestamp: Date.now()
            };
            
            localStorage.setItem(TILE_CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            console.warn('Error caching tile:', e);
            // If localStorage is full, clear the cache
            if (e instanceof Error && e.name === 'QuotaExceededError') {
                localStorage.removeItem(TILE_CACHE_KEY);
            }
        }
    }
    
    // Use a more compatible caching approach
    tileLayer.on('tileload', function(e: any) {
        const tile = e.tile;
        const url = e.url;
        
        if (tile instanceof HTMLImageElement && url) {
            // Cache the tile after it loads successfully
            setTimeout(() => {
                if (tile.complete && tile.naturalWidth > 0 && tile.naturalHeight > 0) {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        canvas.width = tile.naturalWidth;
                        canvas.height = tile.naturalHeight;
                        try {
                            ctx.drawImage(tile, 0, 0);
                            const dataUrl = canvas.toDataURL('image/png', 0.8);
                            cacheTile(url, dataUrl);
                            console.debug('Cached tile:', url);
                        } catch (e) {
                            // CORS or other canvas security error - this is expected
                            console.debug('Could not cache tile due to CORS policy:', url);
                        }
                    }
                }
            }, 100);
        }
    });
    
    // Handle tile errors
    tileLayer.on('tileerror', function(e: any) {
        console.warn('Tile failed to load:', e.url);
    });
    
    console.log('Tile caching enabled - tiles will be cached for', CACHE_EXPIRY_HOURS, 'hours');
}

function initializeMap(): void {
    console.log("Map script loaded");
    map = L.map('map').setView([-43.531, 172.62], 15);
    
    // Configure tile layer with caching options
    // Add cache-friendly parameters to the URL
    const cacheTimestamp = Math.floor(Date.now() / (1000 * 60 * 60 * 24)); // Daily cache key
    const tileLayer = L.tileLayer(`https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=${THUNDER_API_KEY}&cache=${cacheTimestamp}`, {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        // Cache configuration
        maxNativeZoom: 19,
        crossOrigin: 'anonymous', // Enable CORS for better caching
        // Force browser caching with proper headers
        tileSize: 256,
        zoomOffset: 0,
        // Add cache-busting prevention
        detectRetina: false,
        // Enable tile caching
        keepBuffer: 2, // Keep tiles loaded outside visible area
        updateWhenIdle: false,

    });
    
    // Add custom caching logic
    setupTileCache(tileLayer);
    
    tileLayer.addTo(map);

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
    setupCacheManagement();
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

    // Setup save and manage routes modals
    setupSaveRouteModal();
    setupRenameRouteModal();
    setupSavedRoutesModal();
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

// Saved Routes Management
const SAVED_ROUTES_KEY = 'cycleplan_saved_routes';

function getSavedRoutes(): SavedRoute[] {
    try {
        const saved = localStorage.getItem(SAVED_ROUTES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.warn('Error loading saved routes:', e);
        return [];
    }
}

function saveSavedRoutes(routes: SavedRoute[]): void {
    try {
        localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
    } catch (e) {
        console.warn('Error saving routes:', e);
        alert('Error saving routes: ' + (e as Error).message);
    }
}

function generateRouteId(): string {
    return 'route_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function saveCurrentRoute(name: string, description: string): void {
    // TODO: Check if route is the same as existing route. Store hash of points for comparison?
    if (routingPoints.length === 0) {
        alert('No route to save. Please add some routing points first.');
        return;
    }

    const routes = getSavedRoutes();
    
    // Check if name already exists
    if (routes.some(route => route.name === name)) {
        if (!confirm(`A route named "${name}" already exists. Do you want to overwrite it?`)) {
            return;
        }
        // Remove existing route with same name
        const updatedRoutes = routes.filter(route => route.name !== name);
        saveSavedRoutes(updatedRoutes);
    }

    const newRoute: SavedRoute = {
        id: generateRouteId(),
        name: name,
        description: description,
        points: routingPoints.map(point => L.latLng(point.lat, point.lng)),
        distance: currentRouteDistance,
        created: new Date().toISOString()
    };

    const updatedRoutes = getSavedRoutes();
    updatedRoutes.push(newRoute);
    saveSavedRoutes(updatedRoutes);
    
    console.log('Route saved:', newRoute);
}

function loadSavedRoute(routeId: string): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    // Clear current route
    resetRoute();
    
    // Load the saved route
    routingPoints = route.points.map(point => L.latLng(point.lat, point.lng));
    currentRouteDistance = route.distance;
    
    redrawMarkers();
    updatePointCount();
    updateDistanceDisplay();
    updateRoute();
    
    console.log('Route loaded:', route);
    
    // Zoom and center the map to show the whole route
    fitMapToRoute();
}

function fitMapToRoute(): void {
    if (routingPoints.length === 0) {
        return;
    }
    
    if (routingPoints.length === 1) {
        // If only one point, center on it with a reasonable zoom
        const point = routingPoints[0];
        if (point) {
            map.setView(point, 15);
        }
        return;
    }
    
    // Create a bounds object from all routing points
    const bounds = L.latLngBounds(routingPoints);
    
    // Fit the map to the bounds with some padding
    map.fitBounds(bounds, {
        padding: [20, 20], // 20px padding on all sides
        maxZoom: 16 // Don't zoom in too much for short routes
    });
}

function deleteSavedRoute(routeId: string): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    if (confirm(`Are you sure you want to delete the route "${route.name}"?`)) {
        const updatedRoutes = routes.filter(r => r.id !== routeId);
        saveSavedRoutes(updatedRoutes);
        refreshSavedRoutesTable();
    }
}

function renameSavedRoute(routeId: string, newName: string): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    // Check if new name already exists
    if (routes.some(r => r.name === newName && r.id !== routeId)) {
        alert(`A route named "${newName}" already exists. Please choose a different name.`);
        return;
    }

    route.name = newName;
    saveSavedRoutes(routes);
    refreshSavedRoutesTable();
}

function exportSavedRoutes(routeIds: string[]): void {
    // TODO: Support exporting to different formats (e.g., GPX, KML, FIT)
    const routes = getSavedRoutes();
    const routesToExport = routes.filter(route => routeIds.includes(route.id));
    
    if (routesToExport.length === 0) {
        alert('No routes selected for export.');
        return;
    }

    const dataStr = JSON.stringify(routesToExport, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `cycleplan_routes_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importSavedRoutes(file: File): void {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedRoutes: SavedRoute[] = JSON.parse(e.target?.result as string);
            
            if (!Array.isArray(importedRoutes)) {
                throw new Error('Invalid file format: expected an array of routes');
            }

            const currentRoutes = getSavedRoutes();
            let importedCount = 0;
            let skippedCount = 0;

            for (const route of importedRoutes) {
                // Validate route structure
                if (!route.name || !route.points || !Array.isArray(route.points)) {
                    console.warn('Skipping invalid route:', route);
                    skippedCount++;
                    continue;
                }

                // Check if route name already exists
                if (currentRoutes.some(r => r.name === route.name)) {
                    if (!confirm(`Route "${route.name}" already exists. Do you want to overwrite it?`)) {
                        skippedCount++;
                        continue;
                    }
                    // Remove existing route
                    const index = currentRoutes.findIndex(r => r.name === route.name);
                    if (index >= 0) {
                        currentRoutes.splice(index, 1);
                    }
                }

                // Add imported route with new ID
                const newRoute: SavedRoute = {
                    ...route,
                    id: generateRouteId(),
                    points: route.points.map(point => L.latLng(point.lat, point.lng))
                };
                currentRoutes.push(newRoute);
                importedCount++;
            }

            saveSavedRoutes(currentRoutes);
            refreshSavedRoutesTable();
            
            alert(`Import completed!\nImported: ${importedCount} routes\nSkipped: ${skippedCount} routes`);
        } catch (error) {
            alert('Error importing routes: ' + (error as Error).message);
        }
    };
    reader.readAsText(file);
}

function refreshSavedRoutesTable(): void {
    const tableBody = document.getElementById('savedRoutesTableBody');
    if (!tableBody) return;

    const routes = getSavedRoutes();
    tableBody.innerHTML = '';

    routes.forEach(route => {
        const row = document.createElement('tr');
        row.dataset.routeId = route.id;
        
        const formattedDate = new Date(route.created).toLocaleDateString();
        const pointCount = route.points.length;
        const distanceDisplay = route.distance > 1000 
            ? `${(route.distance / 1000).toFixed(2)} km`
            : `${route.distance} m`;

        row.innerHTML = `
            <td><input type="checkbox" class="route-checkbox" data-route-id="${route.id}"></td>
            <td class="route-name" data-route-id="${route.id}">${route.name}</td>
            <td>${route.description || ''}</td>
            <td>${pointCount}</td>
            <td>${distanceDisplay}</td>
            <td>${formattedDate}</td>
            <td class="route-actions">
                <button class="load-btn" data-route-id="${route.id}">Load</button>
                <button class="edit-btn" data-route-id="${route.id}">Rename</button>
                <button class="delete-btn" data-route-id="${route.id}">Delete</button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });

    // Add event listeners for table actions
    setupSavedRoutesTableEventListeners();
}

function setupSavedRoutesTableEventListeners(): void {
    // Load route buttons
    document.querySelectorAll('.load-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const routeId = (e.target as HTMLElement).dataset.routeId;
            if (routeId) {
                loadSavedRoute(routeId);
                closeSavedRoutesModal();
            }
        });
    });

    // Delete route buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const routeId = (e.target as HTMLElement).dataset.routeId;
            if (routeId) {
                deleteSavedRoute(routeId);
            }
        });
    });

    // Rename route buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const routeId = (e.target as HTMLElement).dataset.routeId;
            if (routeId) {
                openRenameRouteModal(routeId);
            }
        });
    });

    // Route checkboxes
    document.querySelectorAll('.route-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedRoutesUI);
    });

    // Select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllCheckbox') as HTMLInputElement;
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = (e.target as HTMLInputElement).checked;
            document.querySelectorAll('.route-checkbox').forEach(cb => {
                (cb as HTMLInputElement).checked = isChecked;
            });
            updateSelectedRoutesUI();
        });
    }
}

function updateSelectedRoutesUI(): void {
    const checkboxes = document.querySelectorAll('.route-checkbox') as NodeListOf<HTMLInputElement>;
    const selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    // Update select all checkbox state
    const selectAllCheckbox = document.getElementById('selectAllCheckbox') as HTMLInputElement;
    if (selectAllCheckbox) {
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
        selectAllCheckbox.checked = selectedCount === checkboxes.length;
    }

    // Update delete button state
    const deleteBtn = document.getElementById('deleteSelectedRoutes') as HTMLButtonElement;
    const exportBtn = document.getElementById('exportSelectedRoutes') as HTMLButtonElement;
    if (deleteBtn) deleteBtn.disabled = selectedCount === 0;
    if (exportBtn) exportBtn.disabled = selectedCount === 0;
}

function getSelectedRouteIds(): string[] {
    const checkboxes = document.querySelectorAll('.route-checkbox:checked') as NodeListOf<HTMLInputElement>;
    return Array.from(checkboxes).map(cb => cb.dataset.routeId!);
}

function setupSaveRouteModal(): void {
    const modal = document.getElementById('saveRouteModal');
    const saveBtn = document.getElementById('saveRoute');
    const closeBtn = modal?.querySelector('.close');
    const cancelBtn = modal?.querySelector('.cancel');
    const form = document.getElementById('saveRouteForm');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (routingPoints.length === 0) {
                alert('No route to save. Please add some routing points first.');
                return;
            }
            modal!.style.display = 'block';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal!.style.display = 'none';
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal!.style.display = 'none';
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form as HTMLFormElement);
            const name = formData.get('routeName') as string;
            const description = formData.get('routeDescription') as string;
            
            if (name.trim()) {
                saveCurrentRoute(name.trim(), description.trim());
                modal!.style.display = 'none';
                (form as HTMLFormElement).reset();
            }
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal!.style.display = 'none';
        }
    });
}

function setupRenameRouteModal(): void {
    const modal = document.getElementById('renameRouteModal');
    const closeBtn = modal?.querySelector('.close');
    const cancelBtn = modal?.querySelector('.cancel');
    const form = document.getElementById('renameRouteForm');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal!.style.display = 'none';
            currentRenamingRouteId = null;
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal!.style.display = 'none';
            currentRenamingRouteId = null;
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form as HTMLFormElement);
            const newName = formData.get('newRouteName') as string;
            
            if (newName.trim() && currentRenamingRouteId) {
                renameSavedRoute(currentRenamingRouteId, newName.trim());
                modal!.style.display = 'none';
                currentRenamingRouteId = null;
                (form as HTMLFormElement).reset();
            }
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal!.style.display = 'none';
            currentRenamingRouteId = null;
        }
    });
}

function openRenameRouteModal(routeId: string): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    currentRenamingRouteId = routeId;
    const modal = document.getElementById('renameRouteModal');
    const nameInput = document.getElementById('newRouteName') as HTMLInputElement;
    
    if (modal && nameInput) {
        nameInput.value = route.name;
        modal.style.display = 'block';
        nameInput.focus();
        nameInput.select();
    }
}

function setupSavedRoutesModal(): void {
    const modal = document.getElementById('manageSavedRoutesModal');
    const manageBtn = document.getElementById('manageSavedRoutes');
    const closeBtn = modal?.querySelector('.close');

    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            modal!.style.display = 'block';
            refreshSavedRoutesTable();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal!.style.display = 'none';
        });
    }

    // Toolbar buttons
    const selectAllBtn = document.getElementById('selectAllRoutes');
    const deselectAllBtn = document.getElementById('deselectAllRoutes');
    const deleteSelectedBtn = document.getElementById('deleteSelectedRoutes');
    const exportSelectedBtn = document.getElementById('exportSelectedRoutes');
    const importBtn = document.getElementById('importRoutesBtn');
    const importInput = document.getElementById('importRoutes') as HTMLInputElement;

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.route-checkbox').forEach(cb => {
                (cb as HTMLInputElement).checked = true;
            });
            updateSelectedRoutesUI();
        });
    }

    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.route-checkbox').forEach(cb => {
                (cb as HTMLInputElement).checked = false;
            });
            updateSelectedRoutesUI();
        });
    }

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            const selectedIds = getSelectedRouteIds();
            if (selectedIds.length === 0) return;

            if (confirm(`Are you sure you want to delete ${selectedIds.length} selected route(s)?`)) {
                const routes = getSavedRoutes();
                const updatedRoutes = routes.filter(route => !selectedIds.includes(route.id));
                saveSavedRoutes(updatedRoutes);
                refreshSavedRoutesTable();
            }
        });
    }

    if (exportSelectedBtn) {
        exportSelectedBtn.addEventListener('click', () => {
            const selectedIds = getSelectedRouteIds();
            if (selectedIds.length > 0) {
                exportSavedRoutes(selectedIds);
            }
        });
    }

    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => {
            importInput.click();
        });

        importInput.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                importSavedRoutes(file);
                (e.target as HTMLInputElement).value = ''; // Reset input
            }
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal!.style.display = 'none';
        }
    });
}

function closeSavedRoutesModal(): void {
    const modal = document.getElementById('manageSavedRoutesModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Cache management functions
function getCacheSize(): number {
    const TILE_CACHE_KEY = 'cycleplan_tile_cache';
    try {
        const cache = localStorage.getItem(TILE_CACHE_KEY);
        return cache ? cache.length : 0;
    } catch (e) {
        return 0;
    }
}

function getCacheItemCount(): number {
    const TILE_CACHE_KEY = 'cycleplan_tile_cache';
    try {
        const cache = JSON.parse(localStorage.getItem(TILE_CACHE_KEY) || '{}');
        return Object.keys(cache).length;
    } catch (e) {
        return 0;
    }
}

function clearTileCache(): void {
    const TILE_CACHE_KEY = 'cycleplan_tile_cache';
    try {
        localStorage.removeItem(TILE_CACHE_KEY);
        updateCacheStatus();
        console.log('Tile cache cleared');
    } catch (e) {
        console.warn('Error clearing cache:', e);
    }
}

function updateCacheStatus(): void {
    const cacheStatusElement = document.getElementById('cacheStatus');
    if (cacheStatusElement) {
        const sizeBytes = getCacheSize();
        const itemCount = getCacheItemCount();
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
        
        if (sizeBytes === 0) {
            cacheStatusElement.textContent = 'Cache: Empty';
        } else {
            cacheStatusElement.textContent = `Cache: ${itemCount} tiles (${sizeMB} MB)`;
        }
    }
}

function setupCacheManagement(): void {
    // Update cache status initially and periodically
    updateCacheStatus();
    setInterval(updateCacheStatus, 10000); // Update every 10 seconds
    
    // Clear cache button event handler
    const clearCacheButton = document.getElementById('clearCache');
    if (clearCacheButton) {
        clearCacheButton.addEventListener('click', () => {
            if (confirm('Clear all cached map tiles? This will free up storage space but tiles will need to be downloaded again.')) {
                clearTileCache();
            }
        });
    }
}
