/// <reference types="leaflet" />

import L from 'leaflet';
import type { AppState } from './types';
import { getSavedRoutes, deleteSavedRoute, renameSavedRoute, exportSavedRoutes, importSavedRoutes, saveCurrentRoute } from './routeStorage';

export function createNumberedMarker(latlng: L.LatLng, number: number, map: L.Map, state: AppState, updateRoute: () => Promise<void>, osrmUrl: string): L.Marker {
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
        const { snapToNearestRoad } = await import('./routing');
        const snappedPoint = await snapToNearestRoad(newLatLng, osrmUrl);
        
        if (snappedPoint) {
            // Update the marker position to snapped location
            (e.target as L.Marker).setLatLng(snappedPoint);
            // Update the routing points array
            state.routingPoints[(marker as any).pointIndex] = snappedPoint;
        } else {
            // If snapping fails, use the dragged position
            state.routingPoints[(marker as any).pointIndex] = newLatLng;
        }
        
        // Update the route
        updateRoute();
        
        // Re-enable map click events after a short delay
        setTimeout(() => {
            map.on('click', function(e: L.LeafletMouseEvent) {
                addRoutingPoint(e.latlng, state, map, osrmUrl, updateRoute);
            });
        }, 100);
    });
    
    return marker;
}

export function redrawMarkers(state: AppState, map: L.Map, osrmUrl: string, updateRoute: () => Promise<void>): void {
    // Clear existing markers
    state.routingMarkers.forEach(marker => map.removeLayer(marker));
    state.routingMarkers = [];
    
    // Create new numbered markers
    state.routingPoints.forEach((point, index) => {
        const marker = createNumberedMarker(point, index + 1, map, state, updateRoute, osrmUrl);
        marker.addTo(map);
        state.routingMarkers.push(marker);
    });
}

export function updatePointCount(state: AppState): void {
    const pointCountElement = document.getElementById('pointCount');
    if (pointCountElement) {
        pointCountElement.textContent = `Points: ${state.routingPoints.length}`;
    }
}

export function updateDistanceDisplay(state: AppState): void {
    const distanceElement = document.getElementById('routeDistance');
    if (distanceElement) {
        if (state.currentRouteDistance > 0 && state.currentRouteDistance < 1000) {
            const meters = state.currentRouteDistance;
            distanceElement.textContent = `Route Distance: ${meters} m`;
        } else if (state.currentRouteDistance >= 1000) {
            const km = (state.currentRouteDistance / 1000).toFixed(2);
            distanceElement.textContent = `Route Distance: ${km} km`;
        } else {
            distanceElement.textContent = 'Route Distance: 0 km';
        }
    }
}

export async function addRoutingPoint(latlng: L.LatLng, state: AppState, map: L.Map, osrmUrl: string, updateRoute: () => Promise<void>): Promise<void> {
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
    const { snapToNearestRoad } = await import('./routing');
    const snappedPoint = await snapToNearestRoad(latlng, osrmUrl);
    const pointToAdd = snappedPoint || latlng;
    
    // Remove temp marker
    map.removeLayer(tempMarker);
    
    console.log('Point to add:', pointToAdd); // Debug log
    if (snappedPoint) {
        console.log('Snapped from', latlng, 'to', snappedPoint);
    } else {
        console.log('No snapping occurred, using original point');
    }
    
    state.routingPoints.push(pointToAdd);
    redrawMarkers(state, map, osrmUrl, updateRoute);
    updatePointCount(state);
    updateRoute();
}

// Find the closest road position to user click to insert a new waypoint 
export async function insertWaypointAtBestPosition(newPoint: L.LatLng, state: AppState, map: L.Map, osrmUrl: string, updateRoute: () => Promise<void>): Promise<void> {
    if (state.routingPoints.length < 2) return;
    
    let bestIndex = 1; // Insert after first point by default
    let minDistance = Infinity;
    
    const { getDistanceToLineSegment, snapToNearestRoad } = await import('./routing');
    
    // Find which segment the new point is closest to
    for (let i = 0; i < state.routingPoints.length - 1; i++) {
        const segmentStart = state.routingPoints[i];
        const segmentEnd = state.routingPoints[i + 1];
        
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
    const snappedPoint = await snapToNearestRoad(newPoint, osrmUrl);
    const pointToInsert = snappedPoint || newPoint;
    
    // Insert the new waypoint at the best position
    state.routingPoints.splice(bestIndex, 0, pointToInsert);
    redrawMarkers(state, map, osrmUrl, updateRoute);
    updatePointCount(state);
    updateRoute();
}

// Remove a routing point by index
export function removeRoutingPoint(index: number, state: AppState, map: L.Map, osrmUrl: string, updateRoute: () => Promise<void>): void {
    if (index >= 0 && index < state.routingPoints.length) {
        state.routingPoints.splice(index, 1);
        redrawMarkers(state, map, osrmUrl, updateRoute);
        updatePointCount(state);
        updateRoute();
    }
}

// Reset all routing points
export function resetRoute(state: AppState, map: L.Map): void {
    state.routingPoints = [];
    state.routingMarkers.forEach(marker => map.removeLayer(marker));
    state.routingMarkers = [];
    if (state.routeLayer) {
        state.routeLayer.clearLayers();
    }
    state.currentRouteDistance = 0;
    updatePointCount(state);
    updateDistanceDisplay(state);
}

export function fitMapToRoute(map: L.Map, routingPoints: L.LatLng[]): void {
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

export function loadSavedRoute(routeId: string, state: AppState, map: L.Map, osrmUrl: string, updateRoute: () => Promise<void>): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    // Clear current route
    resetRoute(state, map);
    
    // Load the saved route
    state.routingPoints = route.points.map(point => L.latLng(point.lat, point.lng));
    state.currentRouteDistance = route.distance;
    
    redrawMarkers(state, map, osrmUrl, updateRoute);
    updatePointCount(state);
    updateDistanceDisplay(state);
    updateRoute();
    
    console.log('Route loaded:', route);
    
    // Zoom and center the map to show the whole route
    fitMapToRoute(map, state.routingPoints);
}

// UI Management Functions
export function refreshSavedRoutesTable(): void {
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
                // This will be handled by the main app
                const event = new CustomEvent('loadRoute', { detail: { routeId } });
                document.dispatchEvent(event);
            }
        });
    });

    // Delete route buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const routeId = (e.target as HTMLElement).dataset.routeId;
            if (routeId) {
                deleteSavedRoute(routeId, refreshSavedRoutesTable);
            }
        });
    });

    // Rename route buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const routeId = (e.target as HTMLElement).dataset.routeId;
            if (routeId) {
                const event = new CustomEvent('renameRoute', { detail: { routeId } });
                document.dispatchEvent(event);
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

export function getSelectedRouteIds(): string[] {
    const checkboxes = document.querySelectorAll('.route-checkbox:checked') as NodeListOf<HTMLInputElement>;
    return Array.from(checkboxes).map(cb => cb.dataset.routeId!);
}
