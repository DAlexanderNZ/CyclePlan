Bun.serve({
    development: true,
    
    // Handle static file serving
    async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;
        
        // Route handlers
        if (pathname === "/") {
            return new Response(Bun.file("./public/map.html"));
        }
        if (pathname === "/about") {
            return new Response("About Page");
        }
        
        // Serve config.json dynamically with localhost replacement
        if (pathname === "/config.json") {
            try {
                const configFile = Bun.file("./public/config.json");
                const configText = await configFile.text();
                const config = JSON.parse(configText);
                const serverHost = req.headers.get('host')?.split(':')[0] || 'localhost';
                const clientConfig = replaceLocalhostWithServerHost(config, serverHost);
                
                return new Response(JSON.stringify(clientConfig, null, 2), {
                    headers: { "Content-Type": "application/json" }
                });
            } catch (error) {
                return new Response("Config file not found", { status: 404 });
            }
        }
        
        // Serve static files from public directory
        const filePath = `./public${pathname}`;
        const file = Bun.file(filePath);
        
        return new Response(file);
    },
    
    port: 8021,

    error(error) {
        return new Response(`<pre>${error}\n${error.stack}</pre>`, {
            headers: { "Content-Type": "text/html" },
        });
    },
});

console.log(`Server is running on http://localhost:8021`);

// Replace localhost with server host in config if site is accessed remotely and services are on localhost
function replaceLocalhostWithServerHost(config: any, serverHost: string): any {
    const replacedConfig = { ...config };
    const replaceLocalhost = (address: string) => address?.replace(/localhost/g, serverHost) || address;
    
    if (replacedConfig.osrmAddress) replacedConfig.osrmAddress = replaceLocalhost(replacedConfig.osrmAddress);
    if (replacedConfig.localTileAddress) replacedConfig.localTileAddress = replaceLocalhost(replacedConfig.localTileAddress);
    if (replacedConfig.openTopoDataAddress) replacedConfig.openTopoDataAddress = replaceLocalhost(replacedConfig.openTopoDataAddress);
    
    return replacedConfig;
}
