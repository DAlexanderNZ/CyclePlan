/// <reference types="leaflet" />

declare const L: typeof import('leaflet');

export function setupTileCache(tileLayer: L.TileLayer): void {
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