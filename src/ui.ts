/// <reference types="leaflet" />

import L from 'leaflet';
import type { AppState } from './types';
import { getSavedRoutes, renameSavedRoute, exportSavedRoutes, importSavedRoutes, saveCurrentRoute, saveSavedRoutes } from './routeStorage';
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

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (state.routingPoints.length === 0) {
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
                saveCurrentRoute(state.routingPoints, state.currentRouteDistance, name.trim(), description.trim());
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
