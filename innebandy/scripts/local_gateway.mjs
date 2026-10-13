// Gateway for the local Supabase stack: routes /auth/v1 to GoTrue and
// /rest/v1 to PostgREST, like the hosted Supabase API. Development only.
import http from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const ROUTES = [
  { prefix: "/auth/v1", port: Number(process.env.AUTH_PORT ?? 54323) },
  { prefix: "/rest/v1", port: Number(process.env.REST_PORT ?? 54322) },
];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, range, x-client-info, accept-profile, content-profile, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "access-control-expose-headers": "content-range, content-location",
};

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS).end();
      return;
    }
    const route = ROUTES.find((r) => req.url.startsWith(r.prefix));
    if (!route) {
      res.writeHead(404, CORS).end("not found");
      return;
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: route.port, method: req.method, path: req.url.slice(route.prefix.length) || "/", headers: req.headers },
      (up) => {
        const headers = { ...up.headers, ...CORS };
        res.writeHead(up.statusCode ?? 502, headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502, CORS).end(String(e));
    });
    req.pipe(upstream);
  })
  .listen(PORT, () => console.log(`gateway on :${PORT}`));
