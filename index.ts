console.log("Hello via Bun!");

Bun.serve({
    development: true,
    routes: {
        "/": () => new Response(Bun.file("./public/map.html")),
        "/about": () => new Response("About Page"),
        "/assets/style.css": () => new Response(Bun.file("./public/assets/style.css")),
    },
    
    port: 8021,

    error(error) {
        return new Response(`<pre>${error}\n${error.stack}</pre>`, {
            headers: { "Content-Type": "text/html" },
        });
    },
});

console.log(`Server is running on http://localhost:8021`);