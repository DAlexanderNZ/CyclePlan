/// <reference types="leaflet" />

export interface Config {
    thunderApiKey: string;
    osrmAddress: string;
}

export interface SavedRoute {
    id: string;
    name: string;
    description: string;
    points: L.LatLng[];
    distance: number;
    created: string;
}

export interface AppState {
    map: L.Map | null;
    routeLayer: L.LayerGroup | null;
    routingPoints: L.LatLng[];
    routingMarkers: L.Marker[];
    currentRouteDistance: number;
    currentRenamingRouteId: string | null;
    config: Config | null;
}
