// Serves the page's text and model files compressed (brotli, else gzip), so
// readers on phones download a fraction of the bytes: three.js and the 3D
// forest model shrink to roughly a quarter. Built on Node's own zlib, no
// extra dependency. Each file is compressed once, the first time it's asked
// for (or at start-up, for the big ones), and kept in memory until it changes.
//
// Anything it doesn't handle (images, small files, clients that don't accept
// compression, missing files) falls through to express.static.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
};
const MIN_BYTES = 1024; // smaller files aren't worth it

function compress(raw) {
  const br = new Promise((done, fail) => zlib.brotliCompress(raw, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
  }, (err, out) => (err ? fail(err) : done(out))));
  const gzip = new Promise((done, fail) => zlib.gzip(raw, { level: 9 }, (err, out) => (err ? fail(err) : done(out))));
  return Promise.all([br, gzip]).then(([b, g]) => ({ br: b, gzip: g }));
}

// root: the folder served. longCache(relPath): true for files that never
// change under the same name, which browsers may then keep for a month;
// everything else is re-checked on each visit (a cheap "not modified" reply).
function compressedStatic(root, { longCache = () => false, warm = [] } = {}) {
  root = path.resolve(root);
  const cache = new Map(); // absolute path → Promise<{ mtimeMs, size, tag, br, gzip }>

  function entry(file, stat) {
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.ready;
    const ready = fs.promises.readFile(file).then(async (raw) => ({
      tag: crypto.createHash("sha1").update(raw).digest("base64url").slice(0, 16),
      ...(await compress(raw)),
    }));
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, ready });
    ready.catch(() => cache.delete(file));
    return ready;
  }

  // Compress the big files straight away, so the first reader doesn't wait.
  for (const rel of warm) {
    const file = path.join(root, rel);
    fs.promises.stat(file).then((stat) => entry(file, stat)).catch(() => {});
  }

  return async function serveCompressed(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const accept = String(req.headers["accept-encoding"] || "");
    const encoding = /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
    if (!encoding) return next();

    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    if (rel.endsWith("/")) rel += "index.html";
    if (rel.split("/").some((part) => part.startsWith("."))) return next(); // dotfiles, "..": not ours
    const type = TYPES[path.extname(rel).toLowerCase()];
    if (!type) return next();
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) return next();

    let stat, e;
    try {
      stat = await fs.promises.stat(file);
      if (!stat.isFile() || stat.size < MIN_BYTES) return next();
      e = await entry(file, stat);
    } catch {
      return next();
    }

    const tag = `"${e.tag}-${encoding}"`;
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("ETag", tag);
    res.setHeader("Cache-Control", longCache(rel) ? "public, max-age=2592000" : "no-cache");
    if (String(req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(tag)) return res.status(304).end();
    const body = e[encoding];
    res.setHeader("Content-Length", body.length);
    res.end(req.method === "HEAD" ? undefined : body);
  };
}

module.exports = { compressedStatic };
