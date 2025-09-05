/// <reference types="leaflet" />

import L from 'leaflet';
import type { AppState } from './types';
import { getSavedRoutes, renameSavedRoute, exportSavedRoutes, importSavedRoutes, saveCurrentRoute, updateExistingRoute, saveSavedRoutes } from './routeStorage';
import { refreshSavedRoutesTable, getSelectedRouteIds } from './waypoints';

export function addInfoControl(map: L.Map): void {
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

export function setupSaveRouteModal(state: AppState): void {
    const modal = document.getElementById('saveRouteModal');
    const saveBtn = document.getElementById('saveRoute');
    const closeBtn = modal?.querySelector('.close');
    const cancelBtn = modal?.querySelector('.cancel');
    const form = document.getElementById('saveRouteForm');
    const modalTitle = document.getElementById('saveRouteModalTitle');
    const loadedRouteInfo = document.getElementById('loadedRouteInfo');
    const loadedRouteName = document.getElementById('loadedRouteName');
    const modificationNotice = document.getElementById('modificationNotice');
    const saveOptions = document.getElementById('saveOptions');
    const saveSubmitBtn = document.getElementById('saveSubmitBtn');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (state.routingPoints.length === 0) {
                alert('No route to save. Please add some routing points first.');
                return;
            }

            // Check if we have a loaded route
            const hasLoadedRoute = state.currentLoadedRouteId !== null;
            
            if (hasLoadedRoute) {
                const routes = getSavedRoutes();
                const loadedRoute = routes.find(r => r.id === state.currentLoadedRouteId);
                
                if (loadedRoute) {
                    // Show the loaded route info and options
                    modalTitle!.textContent = 'Save Route';
                    loadedRouteInfo!.style.display = 'block';
                    loadedRouteName!.textContent = loadedRoute.name;
                    
                    // Show modification notice if route has been modified
                    if (modificationNotice) {
                        modificationNotice.style.display = state.isRouteModified ? 'block' : 'none';
                    }
                    
                    saveOptions!.style.display = 'block';
                    
                    // Pre-fill form with loaded route data
                    (document.getElementById('routeName') as HTMLInputElement).value = loadedRoute.name;
                    (document.getElementById('routeDescription') as HTMLTextAreaElement).value = loadedRoute.description;
                    
                    // Set default to update existing route
                    (document.querySelector('input[name="saveAction"][value="update"]') as HTMLInputElement).checked = true;
                    updateSaveButtonText();
                } else {
                    // Route not found, treat as new
                    setupForNewRoute();
                }
            } else {
                // No loaded route, set up for new route
                setupForNewRoute();
            }

            modal!.style.display = 'block';
        });
    }

    function setupForNewRoute() {
        modalTitle!.textContent = 'Save New Route';
        loadedRouteInfo!.style.display = 'none';
        saveOptions!.style.display = 'none';
        saveSubmitBtn!.textContent = 'Save';
        
        // Clear form
        (document.getElementById('routeName') as HTMLInputElement).value = '';
        (document.getElementById('routeDescription') as HTMLTextAreaElement).value = '';
    }

    function updateSaveButtonText() {
        const selectedAction = document.querySelector('input[name="saveAction"]:checked') as HTMLInputElement;
        if (selectedAction) {
            if (selectedAction.value === 'update') {
                saveSubmitBtn!.textContent = state.isRouteModified ? 'Update Route' : 'Update Route';
            } else {
                saveSubmitBtn!.textContent = 'Save as New';
            }
        }
    }

    if (saveOptions) {
        saveOptions.addEventListener('change', (e) => {
            if ((e.target as HTMLInputElement).name === 'saveAction') {
                updateSaveButtonText();
                
                // If switching to "save as new", clear the route name to force user to enter a new one
                if ((e.target as HTMLInputElement).value === 'new') {
                    (document.getElementById('routeName') as HTMLInputElement).value = '';
                }
            }
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
            
            if (!name.trim()) {
                alert('Please enter a route name.');
                return;
            }

            // Determine if we should update existing or save as new
            const hasLoadedRoute = state.currentLoadedRouteId !== null;
            const selectedAction = hasLoadedRoute ? 
                (document.querySelector('input[name="saveAction"]:checked') as HTMLInputElement)?.value : 
                'new';

            if (hasLoadedRoute && selectedAction === 'update') {
                // Update existing route
                updateExistingRoute(
                    state.currentLoadedRouteId!, 
                    state.routingPoints, 
                    state.currentRouteDistance, 
                    name.trim(), 
                    description.trim()
                );
                // Reset modification flag since route is now saved
                state.isRouteModified = false;
            } else {
                // Save as new route
                saveCurrentRoute(state.routingPoints, state.currentRouteDistance, name.trim(), description.trim());
                // Clear the loaded route ID and modification flag since we saved as new
                state.currentLoadedRouteId = null;
                state.isRouteModified = false;
                alert('Route saved successfully!');
            }
            
            modal!.style.display = 'none';
            (form as HTMLFormElement).reset();
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal!.style.display = 'none';
        }
    });
}

export function setupRenameRouteModal(state: AppState): void {
    const modal = document.getElementById('renameRouteModal');
    const closeBtn = modal?.querySelector('.close');
    const cancelBtn = modal?.querySelector('.cancel');
    const form = document.getElementById('renameRouteForm');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal!.style.display = 'none';
            state.currentRenamingRouteId = null;
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal!.style.display = 'none';
            state.currentRenamingRouteId = null;
        });
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form as HTMLFormElement);
            const newName = formData.get('newRouteName') as string;
            
            if (newName.trim() && state.currentRenamingRouteId) {
                renameSavedRoute(state.currentRenamingRouteId, newName.trim(), refreshSavedRoutesTable);
                modal!.style.display = 'none';
                state.currentRenamingRouteId = null;
                (form as HTMLFormElement).reset();
            }
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal!.style.display = 'none';
            state.currentRenamingRouteId = null;
        }
    });
}

export function openRenameRouteModal(routeId: string, state: AppState): void {
    const routes = getSavedRoutes();
    const route = routes.find(r => r.id === routeId);
    
    if (!route) {
        alert('Route not found!');
        return;
    }

    state.currentRenamingRouteId = routeId;
    const modal = document.getElementById('renameRouteModal');
    const nameInput = document.getElementById('newRouteName') as HTMLInputElement;
    
    if (modal && nameInput) {
        nameInput.value = route.name;
        modal.style.display = 'block';
        nameInput.focus();
        nameInput.select();
    }
}

export function setupSavedRoutesModal(): void {
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
            // Update UI handled by waypoints module
        });
    }

    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.route-checkbox').forEach(cb => {
                (cb as HTMLInputElement).checked = false;
            });
            // Update UI handled by waypoints module
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
                importSavedRoutes(file, refreshSavedRoutesTable);
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

export function closeSavedRoutesModal(): void {
    const modal = document.getElementById('manageSavedRoutesModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

export function setupSettingsModal(state: AppState): void {
    const modal = document.getElementById('settingsModal');
    const settingsBtn = document.getElementById('settings');
    const closeBtn = modal?.querySelector('.close');
    const cancelBtn = modal?.querySelector('.cancel');
    const form = document.getElementById('settingsForm');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (state.config) {
                // Populate form with current config values
                const osrmUrlInput = document.getElementById('osrmUrl') as HTMLInputElement;
                const mapTileUrlInput = document.getElementById('mapTileUrl') as HTMLInputElement;
                const mapTileApiKeyInput = document.getElementById('mapTileApiKey') as HTMLInputElement;
                const enableOpenTopoDataInput = document.getElementById('enableOpenTopoData') as HTMLInputElement;
                const openTopoDataUrlInput = document.getElementById('OpenTopoDataUrl') as HTMLInputElement;
                const openTopoDataDataSetSelect = document.getElementById('OpenTopoDataDataSet') as HTMLSelectElement;

                if (osrmUrlInput) osrmUrlInput.value = state.config.osrmUrl || `http://${state.config.osrmAddress}/`;
                if (mapTileUrlInput) mapTileUrlInput.value = state.config.mapTileUrl || 'https://tile.thunderforest.com/cycle/';
                if (mapTileApiKeyInput) mapTileApiKeyInput.value = state.config.mapTileApiKey || state.config.thunderApiKey;
                if (enableOpenTopoDataInput) enableOpenTopoDataInput.checked = state.config.enableOpenTopoData || false;
                if (openTopoDataUrlInput) openTopoDataUrlInput.value = state.config.openTopoDataUrl || 'http://localhost:5010';
                if (openTopoDataDataSetSelect) openTopoDataDataSetSelect.value = state.config.openTopoDataDataSet || 'srtm';
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
            
            // Update config with new values
            if (state.config) {
                const newConfig = {
                    ...state.config,
                    osrmUrl: formData.get('osrmUrl') as string,
                    mapTileUrl: formData.get('mapTileUrl') as string,
                    mapTileApiKey: formData.get('mapTileApiKey') as string,
                    enableOpenTopoData: formData.has('enableOpenTopoData'),
                    openTopoDataUrl: formData.get('OpenTopoDataUrl') as string,
                    openTopoDataDataSet: formData.get('OpenTopoDataDataSet') as string
                };

                // Validate required fields
                if (!newConfig.osrmUrl.trim()) {
                    alert('OSRM Server URL is required.');
                    return;
                }
                if (!newConfig.mapTileUrl.trim()) {
                    alert('Map Tile URL is required.');
                    return;
                }
                if (!newConfig.mapTileApiKey.trim()) {
                    alert('Map Tile API Key is required.');
                    return;
                }
                if (newConfig.enableOpenTopoData && !newConfig.openTopoDataUrl.trim()) {
                    alert('OpenTopoData Server URL is required when elevation is enabled.');
                    return;
                }

                // Update the state config
                state.config = newConfig;
                modal!.style.display = 'none';
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
