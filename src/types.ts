/// <reference types="leaflet" />

export interface Config {
    thunderApiKey: string;
    osrmAddress: string;
    osrmUrl?: string;
    mapTileUrl?: string;
    mapTileApiKey?: string;
    enableOpenTopoData?: boolean;
    openTopoDataUrl?: string;
    openTopoDataDataSet?: string;
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
    currentLoadedRouteId: string | null;
    isRouteModified: boolean;
    config: Config | null;
}
