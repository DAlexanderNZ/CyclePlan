/// <reference types="leaflet" />

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { AppState } from './types';
import { loadConfig } from './config';
import { setupTileCache } from './tileCache';
import { fetchOsrmRoute, drawRoute } from './routing';
import { 
    addRoutingPoint, 
    insertWaypointAtBestPosition, 
    removeRoutingPoint, 
    resetRoute, 
    updatePointCount, 
    updateDistanceDisplay,
    loadSavedRoute
} from './waypoints';
import { 
    addInfoControl, 
    setupSaveRouteModal, 
    setupRenameRouteModal, 
    setupSavedRoutesModal,
    openRenameRouteModal,
    closeSavedRoutesModal
} from './ui';

// Application state
const appState: AppState = {
    map: null,
    routeLayer: null,
    routingPoints: [],
    routingMarkers: [],
    currentRouteDistance: 0,
    currentRenamingRouteId: null,
    currentLoadedRouteId: null,
    isRouteModified: false,
    config: null
};

let osrmUrl: string = '';

// Initialize the map when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const config = await loadConfig();
        appState.config = config;
        osrmUrl = `http://${config.osrmAddress}/`;
        
        initializeMap();
    } catch (error) {
        console.error('Failed to initialize application:', error);
    }
});

function initializeMap(): void {
    console.log("Map script loaded");
    if (!appState.config) return;
    
    appState.map = L.map('map').setView([-43.531, 172.62], 15);
    
    // Configure tile layer with caching options
    // Add cache-friendly parameters to the URL
    const cacheTimestamp = Math.floor(Date.now() / (1000 * 60 * 60 * 24)); // Daily cache key
    const tileLayer = L.tileLayer(`https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey=${appState.config.thunderApiKey}&cache=${cacheTimestamp}`, {
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
    
    tileLayer.addTo(appState.map);

    // Create a high-z pane so the route draws on top of roads/tiles
    const routePane = appState.map.createPane('routePane');
    routePane.style.zIndex = '650';
    // Disable pointer events so it doesn't block map interactions
    routePane.style.pointerEvents = 'none';

    // Create an even higher pane for markers so they appear above the route
    const markerPane = appState.map.createPane('markerPane');
    markerPane.style.zIndex = '700';

    // Layer group to keep route / markers organized
    appState.routeLayer = L.layerGroup().addTo(appState.map);

    // Set up event handlers
    setupEventHandlers();
    
    // Initialize UI
    updatePointCount(appState);
    updateDistanceDisplay(appState);
    addInfoControl(appState.map);
}

async function updateRoute(): Promise<void> {
    if (!appState.routeLayer || !appState.map) return;
    
    if (appState.routingPoints.length < 2) {
        // Clear route if less than 2 points
        appState.routeLayer.clearLayers();
        appState.currentRouteDistance = 0;
        updateDistanceDisplay(appState);
        return;
    }
    
    console.log('Updating route with points:', appState.routingPoints);
    
    try {
        const result = await fetchOsrmRoute(appState.routingPoints, osrmUrl);
        if (result) {
            console.log('OSRM profile used:', result.profile);
            drawRoute(
                result.route.geometry, 
                appState.routeLayer, 
                appState.map, 
                (point: L.LatLng) => insertWaypointAtBestPosition(point, appState, appState.map!, osrmUrl, updateRoute)
            );
            
            // Extract and store the route distance
            appState.currentRouteDistance = result.route.distance || 0;
            updateDistanceDisplay(appState);
        } else {
            console.warn('No route result returned');
            appState.routeLayer.clearLayers();
            appState.currentRouteDistance = 0;
            updateDistanceDisplay(appState);
        }
    } catch (err) {
        console.error('Routing failed:', err);
        console.error('Error details:', (err as Error).message);
        console.error('Stack trace:', (err as Error).stack);
        appState.currentRouteDistance = 0;
        updateDistanceDisplay(appState);
    }
}

function setupEventHandlers(): void {
    if (!appState.map) return;
    
    // Left click to add routing point
    appState.map.on('click', function(e) {
        addRoutingPoint(e.latlng, appState, appState.map!, osrmUrl, updateRoute);
    });

    // Right click on map to remove nearest point (within reasonable distance)
    appState.map.on('contextmenu', function(e) {
        const clickPoint = e.latlng;
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        const maxDistance = 50; // Maximum distance in meters to consider for removal
        
        appState.routingPoints.forEach((point, index) => {
            const distance = appState.map!.distance(clickPoint, point);
            if (distance < nearestDistance && distance < maxDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });
        
        if (nearestIndex >= 0) {
            removeRoutingPoint(nearestIndex, appState, appState.map!, osrmUrl, updateRoute);
        }
    });

    // Reset button event handler
    const resetButton = document.getElementById('resetRoute');
    if (resetButton) {
        resetButton.addEventListener('click', () => resetRoute(appState, appState.map!));
    }

    // Setup save and manage routes modals
    setupSaveRouteModal(appState);
    setupRenameRouteModal(appState);
    setupSavedRoutesModal();
    
    // Custom event handlers for route management
    document.addEventListener('loadRoute', (e: any) => {
        if (e.detail && e.detail.routeId) {
            loadSavedRoute(e.detail.routeId, appState, appState.map!, osrmUrl, updateRoute);
            closeSavedRoutesModal();
        }
    });
    
    document.addEventListener('renameRoute', (e: any) => {
        if (e.detail && e.detail.routeId) {
            openRenameRouteModal(e.detail.routeId, appState);
        }
    });
}
