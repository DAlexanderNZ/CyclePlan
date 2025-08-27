console.log("Hello via Bun!");

Bun.serve({
    development: true,
    
    // Handle static file serving
    fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;
        
        // Route handlers
        if (pathname === "/") {
            return new Response(Bun.file("./public/map.html"));
        }
        if (pathname === "/about") {
            return new Response("About Page");
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