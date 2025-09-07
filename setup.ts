#!/usr/bin/env bun
import { writeFile, exists } from 'fs/promises';

// Function to prompt user for input
function prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
        process.stdout.write(question);
        process.stdin.setEncoding('utf-8');
        process.stdin.once('data', (data) => {
            resolve(data.toString().trim());
        });
    });
}

async function setup() {
    console.log('🚀 Setting up CyclePlan...\n');
    
    // Check if config.json already exists
    if (await exists('public/config.json')) {
        console.log('✅ public/config.json already exists');
        const overwrite = await prompt('Do you want to overwrite it? (y/N): ');
        if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
            console.log('Setup cancelled.');
            process.exit(0);
        }
    }
    
    try {
        console.log('📝 Please provide the following configuration:\n');
        
        // Prompt for tile service choice
        console.log('🗺️  Map Tile Service:');
        console.log('   Choose your tile service:');
        console.log('   1. Local tile service (self-hosted)');
        console.log('   2. Thunderforest (external service)\n');
        
        const tileChoice = await prompt('Enter your choice (1 for local, 2 for Thunderforest) [2]: ');
        const useLocalTiles = tileChoice === '1';
        
        let thunderApiKey = '';
        let localTileUrl = '';
        
        if (useLocalTiles) {
            console.log('\n🏠 Local Tile Service Configuration:');
            console.log('   Make sure your local tile service is running.');
            console.log('   Default: http://localhost:8080\n');
            console.log('   WARNING: Initial tile rendering may take some time for larger zoom levels.\n');
            
            localTileUrl = await prompt('Enter your local tile server URL [http://localhost:8080]: ');
            if (!localTileUrl) localTileUrl = 'http://localhost:8080';
            
        } else {
            // Prompt for Thunderforest API Key
            console.log('\n🔑 Thunderforest API Key:');
            console.log('   Get your free API key from: https://www.thunderforest.com/');
            console.log('   1. Sign up for a free account');
            console.log('   2. Go to your API key dashboard');
            console.log('   3. Copy your API key\n');
            
            thunderApiKey = await prompt('Enter your Thunderforest API key: ');
            
            if (!thunderApiKey || thunderApiKey === '') {
                console.log('❌ API key is required for Thunderforest. Setup cancelled.');
                process.exit(1);
            }
        }
        
        // Prompt for OSRM Server Address
        console.log('\n🛣️  OSRM Server Address:');
        console.log('   For development, you can use:');
        console.log('   - "localhost:5000" (if running OSRM locally)');
        console.log('   - "router.project-osrm.org" (public demo server - testing only)');
        console.log('   - Your own OSRM server address\n');
        
        const osrmAddress = await prompt('Enter your OSRM server address [localhost:5000]: ');
        const finalOsrmAddress = osrmAddress || 'localhost:5000';
        
        // Create config object
        const config: any = {
            thunderApiKey: thunderApiKey || 'dummy-key-for-local-tiles',
            osrmAddress: finalOsrmAddress,
            useLocalTiles: useLocalTiles
        };
        
        if (useLocalTiles) {
            config.localTileUrl = localTileUrl;
        }
        
        // Write config to file
        await writeFile('public/config.json', JSON.stringify(config, null, 2));
        
        console.log('\n✅ Configuration saved to public/config.json');
        console.log('\n📄 Generated configuration:');
        if (useLocalTiles) {
            console.log(`   Tile Service: Local (${localTileUrl})`);
        } else {
            console.log(`   Thunder API Key: ${thunderApiKey.substring(0, 8)}...`);
            console.log(`   Tile Service: Thunderforest`);
        }
        console.log(`   OSRM Address: ${finalOsrmAddress}`);
        console.log('\n⚠️  Note: public/config.json is not tracked in git for security reasons');
        console.log('\n🏗️  Building application...');
        
        // Run build automatically
        const buildProcess = Bun.spawn(['bun', 'run', 'build'], {
            stdio: ['inherit', 'inherit', 'inherit']
        });
        
        await buildProcess.exited;
        
        if (buildProcess.exitCode === 0) {
            console.log('\n🎉 Setup complete! You can now run the server with:');
            console.log('   bun run server');
        } else {
            console.log('\n⚠️  Setup complete, but build failed. Please run:');
            console.log('   bun run build');
        }
        
    } catch (error) {
        console.error('❌ Error during setup:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

setup();
