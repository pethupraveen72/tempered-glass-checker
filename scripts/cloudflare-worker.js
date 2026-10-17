/**
 * Spec-site Reverse Proxy - Cloudflare Worker
 *
 * Bypasses Cloudflare bot protection on gsmarena.com by routing
 * traffic through Cloudflare's own internal edge network, and fetches the
 * two enrichment sources used for screen and notch type.
 *
 * Instructions:
 * 1. Go to dash.cloudflare.com -> Workers & Pages
 * 2. Create an Application -> Create Worker
 * 3. Paste this code into the editor and click "Deploy"
 * 4. Your new proxy URL will look like:
 *    https://your-worker.yourname.workers.dev/?url=https://www.gsmarena.com/iphone-14-pro.php
 */

// Exact hostnames only. A substring test would turn this worker into an open
// proxy for any URL that merely mentions an allowed domain.
const ALLOWED_HOSTS = new Set([
    "www.gsmarena.com",
    "gsmarena.com",
    "www.kimovil.com",
    "www.smartprix.com",
]);

// Set to your API's origin(s) to stop other sites using this proxy from a
// visitor's browser. Leave empty to send no CORS headers at all.
const ALLOWED_ORIGINS = [];

function corsHeaders(request) {
    const origin = request.headers.get("Origin");
    const headers = { Vary: "Origin" };
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS";
        headers["Access-Control-Allow-Headers"] = "Content-Type";
    }
    return headers;
}

export default {
    async fetch(request) {
        const cors = corsHeaders(request);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: cors });
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Only GET and HEAD are proxied", { status: 405, headers: cors });
        }

        try {
            const targetUrl = new URL(request.url).searchParams.get("url");

            if (!targetUrl) {
                return new Response("Missing 'url' parameter. Example: ?url=https://www.gsmarena.com", {
                    status: 400,
                    headers: cors,
                });
            }

            // Parse the URL and check its hostname exactly, so neither
            // "https://evil.example/?x=gsmarena.com" nor a userinfo or
            // subdomain trick can smuggle another host past the allowlist.
            let parsed;
            try {
                parsed = new URL(targetUrl);
            } catch {
                return new Response("The 'url' parameter is not a valid URL", { status: 400, headers: cors });
            }

            if (parsed.protocol !== "https:") {
                return new Response("Only https targets are proxied", { status: 400, headers: cors });
            }
            if (!ALLOWED_HOSTS.has(parsed.hostname)) {
                return new Response(`This proxy is restricted to: ${[...ALLOWED_HOSTS].join(", ")}`, {
                    status: 403,
                    headers: cors,
                });
            }

            // Send a fixed browser-like header set rather than forwarding the
            // caller's headers, which could carry cookies or an Authorization
            // header through to the target site.
            const response = await fetch(parsed.toString(), {
                method: request.method,
                redirect: "follow",
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            });

            const proxiedResponse = new Response(response.body, response);
            for (const [header, value] of Object.entries(cors)) proxiedResponse.headers.set(header, value);
            // The target's own cookies have no meaning for our caller.
            proxiedResponse.headers.delete("Set-Cookie");
            return proxiedResponse;
        } catch (e) {
            return new Response("Proxy Error: " + e.message, { status: 500, headers: cors });
        }
    },
};
