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
        
        // Mark route as modified
        state.isRouteModified = true;
        
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
    state.isRouteModified = true;
    redrawMarkers(state, map, osrmUrl, updateRoute);
    updatePointCount(state);
    updateRoute();
}

// Waypoint insertion helpers

function extractLatLngsFromPolyline(polyline: L.Polyline): L.LatLng[] {
    const raw = (polyline as any).getLatLngs();
    if (Array.isArray(raw) && raw.length && Array.isArray(raw[0])) {
        return (raw as L.LatLng[][]).flat();
    }
    return raw as L.LatLng[];
}

function calculateCumulativeDistances(routeLatLngs: L.LatLng[]): number[] {
    const cumulative: number[] = [0];
    for (let i = 1; i < routeLatLngs.length; i++) {
        cumulative.push(
            cumulative[i - 1]! + routeLatLngs[i - 1]!.distanceTo(routeLatLngs[i]!)
        );
    }
    return cumulative;
}

function findPolylineForInsertion(state: AppState, providedPolyline?: L.Polyline | null): L.Polyline | null {
    if (providedPolyline) return providedPolyline;
    
    if (state.routeLayer) {
        let foundPolyline: L.Polyline | null = null;
        state.routeLayer.eachLayer((layer: any) => {
            if (!foundPolyline && layer instanceof L.Polyline) {
                foundPolyline = layer as L.Polyline;
            }
        });
        return foundPolyline;
    }
    
    return null;
}

function projectPointOntoPolyline(point: L.LatLng, routeLatLngs: L.LatLng[], cumulativeDistances: number[]): { distance: number; alongDistance: number } {
    const totalLength = cumulativeDistances[cumulativeDistances.length - 1]!;
    let best = { distance: Infinity, alongDistance: 0 };
    
    for (let i = 0; i < routeLatLngs.length - 1; i++) {
        const A = routeLatLngs[i]!;
        const B = routeLatLngs[i + 1]!;
        const Ax = A.lat, Ay = A.lng;
        const Bx = B.lat, By = B.lng;
        const Px = point.lat, Py = point.lng;
        const Cx = Bx - Ax, Cy = By - Ay;
        const lengthSquared = Cx * Cx + Cy * Cy;
        
        let t = lengthSquared === 0 ? 0 : ((Px - Ax) * Cx + (Py - Ay) * Cy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        
        const projectedPoint = L.latLng(Ax + t * Cx, Ay + t * Cy);
        const distanceToPoint = projectedPoint.distanceTo(point);
        const distanceAlongSegment = A.distanceTo(projectedPoint);
        const alongDistance = cumulativeDistances[i]! + distanceAlongSegment;
        
        if (distanceToPoint < best.distance) {
            best = { distance: distanceToPoint, alongDistance };
        }
    }
    
    best.alongDistance = Math.max(0, Math.min(totalLength, best.alongDistance));
    return best;
}

// Find the best insertion index using polyline projection
function findBestInsertionIndex(
    routingPoints: L.LatLng[],
    anchorPoint: L.LatLng,
    routeLatLngs: L.LatLng[],
    cumulativeDistances: number[]
): number {
    const totalLength = cumulativeDistances[cumulativeDistances.length - 1]!;
    const routingPointsAlong = routingPoints.map(rp => 
        projectPointOntoPolyline(rp, routeLatLngs, cumulativeDistances).alongDistance
    );
    const newAlong = projectPointOntoPolyline(anchorPoint, routeLatLngs, cumulativeDistances).alongDistance;
    
    const m = routingPoints.length;
    
    // Find insertion between consecutive routing points (by their order)
    for (let i = 0; i < m; i++) {
        const a = routingPointsAlong[i]!;
        let b = routingPointsAlong[(i + 1) % m]!;
        let na = newAlong;
        
        // Handle wrap-around for the last segment
        if (i === m - 1 && b <= a) b += totalLength;
        if (na < a) na += totalLength;
        
        if (na > a && na <= b) {
            return i + 1;
        }
    }
    
    // If no gap found, pick the gap with smallest distance
    let bestGap = Infinity;
    let bestIndex = m;
    
    for (let i = 0; i < m; i++) {
        const a = routingPointsAlong[i]!;
        let b = routingPointsAlong[(i + 1) % m]!;
        let gap = b - a;
        
        if (i === m - 1 && b <= a) gap = (b + totalLength) - a;
        
        if (gap < bestGap) {
            bestGap = gap;
            bestIndex = i + 1;
        }
    }
    
    return bestIndex;
}

async function insertWaypointByPolylineProjection(
    dropPoint: L.LatLng,
    state: AppState,
    map: L.Map,
    osrmUrl: string,
    updateRoute: () => Promise<void>,
    polyline: L.Polyline,
    anchorPoint?: L.LatLng
): Promise<boolean> {
    try {
        const routeLatLngs = extractLatLngsFromPolyline(polyline);
        if (routeLatLngs.length < 2) return false;
        
        const cumulativeDistances = calculateCumulativeDistances(routeLatLngs);
        
        const insertIndex = findBestInsertionIndex(
            state.routingPoints,
            anchorPoint || dropPoint,
            routeLatLngs,
            cumulativeDistances
        );
        
        const { snapToNearestRoad } = await import('./routing');
        const snapped = await snapToNearestRoad(dropPoint, osrmUrl);
        const pointToInsert = snapped || dropPoint;
        
        state.routingPoints.splice(insertIndex, 0, pointToInsert);
        state.isRouteModified = true;
        redrawMarkers(state, map, osrmUrl, updateRoute);
        updatePointCount(state);
        await updateRoute();
        
        return true;
    } catch (err) {
        console.warn('Polyline projection insertion failed:', err);
        return false;
    }
}

// Fallback insertion by nearest segment
async function insertWaypointByNearestSegment(
    dropPoint: L.LatLng, 
    state: AppState, 
    map: L.Map, 
    osrmUrl: string, 
    updateRoute: () => Promise<void>,
    anchorPoint?: L.LatLng
): Promise<void> {
    const { getDistanceToLineSegment, snapToNearestRoad } = await import('./routing');
    const referencePoint = anchorPoint || dropPoint;
    const n = state.routingPoints.length;
    let bestCandidate = 1;
    let minDistance = Infinity;
    let bestSegmentIndex = 0;
    
    for (let i = 0; i < n; i++) {
        const a = state.routingPoints[i];
        const b = state.routingPoints[(i + 1) % n];
        if (a && b) {
            const distance = getDistanceToLineSegment(referencePoint, a, b);
            if (distance < minDistance) {
                minDistance = distance;
                bestCandidate = (i + 1) % n;
                bestSegmentIndex = i;
            }
        }
    }
    
    const insertIndex = (bestCandidate === 0 && bestSegmentIndex === n - 1) ? n : bestCandidate;
    const snapped = await snapToNearestRoad(dropPoint, osrmUrl);
    const pointToInsert = snapped || dropPoint;
    
    state.routingPoints.splice(insertIndex, 0, pointToInsert);
    state.isRouteModified = true;
    redrawMarkers(state, map, osrmUrl, updateRoute);
    updatePointCount(state);
    await updateRoute();
}

// Find the closest road position to user click to insert a new waypoint 
export async function insertWaypointAtBestPosition(
    dropPoint: L.LatLng, 
    state: AppState, 
    map: L.Map, 
    osrmUrl: string, 
    updateRoute: () => Promise<void>, 
    polyline?: L.Polyline | null, 
    anchorPoint?: L.LatLng
): Promise<void> {
    if (state.routingPoints.length < 2) return;

    // Try polyline-based insertion first
    const usedPolyline = findPolylineForInsertion(state, polyline);
    if (usedPolyline) {
        const success = await insertWaypointByPolylineProjection(
            dropPoint, state, map, osrmUrl, updateRoute, usedPolyline, anchorPoint
        );
        if (success) return;
    }

    // Fallback to nearest segment insertion
    await insertWaypointByNearestSegment(
        dropPoint, state, map, osrmUrl, updateRoute, anchorPoint
    );
}


// Remove a routing point by index
export function removeRoutingPoint(index: number, state: AppState, map: L.Map, osrmUrl: string, updateRoute: () => Promise<void>): void {
    if (index >= 0 && index < state.routingPoints.length) {
        state.routingPoints.splice(index, 1);
        state.isRouteModified = true;
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
    state.currentLoadedRouteId = null;
    state.isRouteModified = false;
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
    state.currentLoadedRouteId = routeId;
    // Restore round-trip flag if present
    state.isRoundTrip = !!(route as any).isRoundTrip;
    state.isRouteModified = false;
    
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

        const roundTripLabel = (route as any).isRoundTrip ? ' (Round Trip)' : '';
        row.innerHTML = `
            <td><input type="checkbox" class="route-checkbox" data-route-id="${route.id}"></td>
            <td class="route-name" data-route-id="${route.id}">${route.name}${roundTripLabel}</td>
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
