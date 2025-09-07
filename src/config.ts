import type { Config } from './types';

export async function loadConfig(): Promise<Config> {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        const config: Config = await response.json();
        
        // Validate required fields based on tile service choice
        if (config.useLocalTiles) {
            // For local tiles, we need either localTileAddress or localTileUrl
            if (!config.localTileAddress && !config.localTileUrl) {
                throw new Error('Local tile server address is required when using local tiles');
            }
        } else {
            // For external tiles, we need thunderApiKey
            if (!config.thunderApiKey || config.thunderApiKey === 'YOUR_THUNDERFOREST_API_KEY_HERE') {
                throw new Error('Please set your Thunderforest API key in config.json');
            }
        }
        
        if (!config.osrmAddress || config.osrmAddress === 'YOUR_OSRM_SERVER_ADDRESS_HERE') {
            throw new Error('Please set your OSRM server address in config.json');
        }
        
        // Set default values for optional settings and construct URLs from addresses
        if (!config.osrmUrl) {
            config.osrmUrl = `http://${config.osrmAddress}/`;
        }
        if (!config.mapTileUrl) {
            config.mapTileUrl = 'https://tile.thunderforest.com/cycle/';
        }
        if (!config.mapTileApiKey) {
            config.mapTileApiKey = config.thunderApiKey;
        }
        if (config.useLocalTiles === undefined) {
            config.useLocalTiles = false;
        }
        if (!config.localTileUrl) {
            // Construct URL from address if provided, otherwise use default
            if (config.localTileAddress) {
                config.localTileUrl = `http://${config.localTileAddress}`;
            } else {
                config.localTileUrl = 'http://localhost:8080';
                config.localTileAddress = 'localhost:8080';
            }
        } else if (!config.localTileAddress) {
            // Extract address from URL for backward compatibility
            try {
                const url = new URL(config.localTileUrl);
                config.localTileAddress = `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
            } catch {
                config.localTileAddress = 'localhost:8080';
            }
        }
        if (config.enableOpenTopoData === undefined) {
            config.enableOpenTopoData = false;
        }
        if (!config.openTopoDataUrl) {
            // Construct URL from address if provided, otherwise use default
            if (config.openTopoDataAddress) {
                config.openTopoDataUrl = `http://${config.openTopoDataAddress}`;
            } else {
                config.openTopoDataUrl = 'http://localhost:5010';
                config.openTopoDataAddress = 'localhost:5010';
            }
        } else if (!config.openTopoDataAddress) {
            // Extract address from URL for backward compatibility
            try {
                const url = new URL(config.openTopoDataUrl);
                config.openTopoDataAddress = `${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
            } catch {
                config.openTopoDataAddress = 'localhost:5010';
            }
        }
        if (!config.openTopoDataDataSet) {
            config.openTopoDataDataSet = 'aster';
        }
        
        return config;
    } catch (error) {
        console.error('Configuration error:', error);
        alert('Configuration error: ' + (error as Error).message + '\n\nPlease run `bun run setup` and fill in your API keys and server addresses.');
        throw error;
    }
}
