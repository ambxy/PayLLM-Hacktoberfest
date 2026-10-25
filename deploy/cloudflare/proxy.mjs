// Public sandbox entry: each visitor gets an isolated container, so the app
// keeps its loopback-only checks and this proxy presents requests as loopback.
import http from "node:http";

const upstream = { host: "127.0.0.1", port: 3000 };
const local = `http://${upstream.host}:${upstream.port}`;
const port = Number(process.env.PORT ?? 8080);

http
  .createServer((req, res) => {
    // Set by the Worker from the visitor's URL; clients cannot supply it.
    const publicOrigin = req.headers["x-demo-origin"];
    const headers = { ...req.headers, host: `${upstream.host}:${upstream.port}` };
    delete headers["x-demo-origin"];
    // Cloudflare adds X-Forwarded-Proto: https etc.; Next would rebuild the
    // request URL from them and it would no longer look like loopback.
    for (const name of Object.keys(headers))
      if (name.startsWith("x-forwarded-") || name === "forwarded")
        delete headers[name];
    // Only same-origin browser requests are translated; anything else stays
    // foreign and is rejected by the app's origin check.
    if (publicOrigin && headers.origin === publicOrigin) headers.origin = local;
    const forward = http.request(
      { ...upstream, method: req.method, path: req.url, headers },
      (upstreamRes) => {
        const out = { ...upstreamRes.headers };
        if (publicOrigin && typeof out.location === "string")
          out.location = out.location.replace(local, publicOrigin);
        res.writeHead(upstreamRes.statusCode ?? 502, out);
        upstreamRes.pipe(res);
      },
    );
    forward.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(forward);
  })
  .listen(port, "0.0.0.0", () => console.log(`Sandbox proxy on :${port}`));
