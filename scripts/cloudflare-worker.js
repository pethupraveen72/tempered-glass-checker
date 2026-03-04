/**
 * GSMArena Reverse Proxy - Cloudflare Worker
 * 
 * Bypasses Cloudflare bot protection on gsmarena.com by routing
 * traffic through Cloudflare's own internal edge network.
 * 
 * Instructions:
 * 1. Go to dash.cloudflare.com -> Workers & Pages
 * 2. Create an Application -> Create Worker
 * 3. Paste this code into the editor and click "Deploy"
 * 4. Your new proxy URL will look like: 
 *    https://your-worker.yourname.workers.dev/?url=https://www.gsmarena.com/iphone-14-pro.php
 */

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                }
            });
        }

        try {
            const url = new URL(request.url);
            const targetUrl = url.searchParams.get("url");

            if (!targetUrl) {
                return new Response("Missing 'url' parameter. Example: ?url=https://www.gsmarena.com", {
                    status: 400,
                    headers: { "Access-Control-Allow-Origin": "*" }
                });
            }

            // Ensure we only proxy GSMArena to prevent abuse
            if (!targetUrl.toLowerCase().includes("gsmarena.com")) {
                return new Response("This proxy is restricted to gsmarena.com", {
                    status: 403,
                    headers: { "Access-Control-Allow-Origin": "*" }
                });
            }

            // Clone original request to preserve headers (but mock User-Agent to look like a browser)
            const modifiedRequest = new Request(targetUrl, {
                method: request.method,
                headers: {
                    ...request.headers,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                }
            });

            // Fetch from GSMArena
            const response = await fetch(modifiedRequest);

            // Clone response to add CORS headers back to your React app/Vercel backend
            const modifiedResponse = new Response(response.body, response);
            modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");

            return modifiedResponse;

        } catch (e) {
            return new Response("Proxy Error: " + e.message, {
                status: 500,
                headers: { "Access-Control-Allow-Origin": "*" }
            });
        }
    },
};
