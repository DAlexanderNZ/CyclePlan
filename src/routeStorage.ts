/// <reference types="leaflet" />

import L from 'leaflet';
import type { SavedRoute } from './types';

const SAVED_ROUTES_KEY = 'cycleplan_saved_routes';

export function getSavedRoutes(): SavedRoute[] {
    try {
        const saved = localStorage.getItem(SAVED_ROUTES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.warn('Error loading saved routes:', e);
        return [];
    }
}

export function saveSavedRoutes(routes: SavedRoute[]): void {
    try {
        localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
    } catch (e) {
        console.warn('Error saving routes:', e);
        alert('Error saving routes: ' + (e as Error).message);
    }
}

export function generateRouteId(): string {
    return 'route_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

export function saveCurrentRoute(routingPoints: L.LatLng[], currentRouteDistance: number, name: string, description: string, isRoundTrip: boolean = false): void {
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
        isRoundTrip: !!isRoundTrip,
        created: new Date().toISOString()
    };

    const updatedRoutes = getSavedRoutes();
    updatedRoutes.push(newRoute);
    saveSavedRoutes(updatedRoutes);
    
    console.log('Route saved:', newRoute);
}

export function deleteSavedRoute(routeId: string, refreshCallback: () => void): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    if (confirm(`Are you sure you want to delete the route "${route.name}"?`)) {
        const updatedRoutes = routes.filter(r => r.id !== routeId);
        saveSavedRoutes(updatedRoutes);
        refreshCallback();
    }
}

export function renameSavedRoute(routeId: string, newName: string, refreshCallback: () => void): void {
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
    refreshCallback();
}

export function updateExistingRoute(routeId: string, routingPoints: L.LatLng[], currentRouteDistance: number, name: string, description: string, isRoundTrip?: boolean): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    // Check if new name conflicts with other routes
    if (routes.some(r => r.name === name && r.id !== routeId)) {
        alert(`A route named "${name}" already exists. Please choose a different name.`);
        return;
    }

    // Update the existing route
    route.name = name;
    route.description = description;
    route.points = routingPoints.map(point => L.latLng(point.lat, point.lng));
    route.distance = currentRouteDistance;
    if (typeof isRoundTrip === 'boolean') {
        (route as any).isRoundTrip = !!isRoundTrip;
    }
    // Keep existing isRoundTrip flag if present; callers may update state.currentLoadedRouteId separately
    
    saveSavedRoutes(routes);
    console.log('Route updated:', route);
}

export function exportSavedRoutes(routeIds: string[]): void {
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

export function importSavedRoutes(file: File, refreshCallback: () => void): void {
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
                    points: route.points.map(point => L.latLng(point.lat, point.lng)),
                    isRoundTrip: (route as any).isRoundTrip || false
                };
                currentRoutes.push(newRoute);
                importedCount++;
            }

            saveSavedRoutes(currentRoutes);
            refreshCallback();
            
            alert(`Import completed!\nImported: ${importedCount} routes\nSkipped: ${skippedCount} routes`);
        } catch (error) {
            alert('Error importing routes: ' + (error as Error).message);
        }
    };
    reader.readAsText(file);
}
