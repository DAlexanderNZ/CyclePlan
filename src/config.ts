import type { Config } from './types';

export async function loadConfig(): Promise<Config> {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        const config: Config = await response.json();
        
        // Validate required fields
        if (!config.thunderApiKey || config.thunderApiKey === 'YOUR_THUNDERFOREST_API_KEY_HERE') {
            throw new Error('Please set your Thunderforest API key in config.json');
        }
        if (!config.osrmAddress || config.osrmAddress === 'YOUR_OSRM_SERVER_ADDRESS_HERE') {
            throw new Error('Please set your OSRM server address in config.json');
        }
        
        // Set default values for optional settings
        if (!config.osrmUrl) {
            config.osrmUrl = `http://${config.osrmAddress}/`;
        }
        if (!config.mapTileUrl) {
            config.mapTileUrl = 'https://tile.thunderforest.com/cycle/';
        }
        if (!config.mapTileApiKey) {
            config.mapTileApiKey = config.thunderApiKey;
        }
        if (config.enableOpenTopoData === undefined) {
            config.enableOpenTopoData = false;
        }
        if (!config.openTopoDataUrl) {
            config.openTopoDataUrl = 'http://localhost:5010';
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
