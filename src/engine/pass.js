// Short-lived signed passes, so the WordPress plugin can show a logged-in
// reader their own garden without putting their subscriber ID in a link.
//
// A pass looks like  p1.<payload>.<signature>. It names one subscriber and
// expires; nobody can make or change one without the secret. It's the ONLY
// thing the private garden routes accept as proof of who someone is: the
// page sends it in the X-Garden-Pass header (so it stays out of URLs and
// logs) and uses "me" in place of the ID in the path. Passes come from the
// WordPress plugin (POST /api/wp/session) or from a reader's personal
// newsletter link (POST /api/garden/session).

const crypto = require("crypto");

const PREFIX = "p1.";
const LIFETIME_SECONDS = 12 * 60 * 60; // long enough for a visit, short enough that a copied link soon stops working

// Its own secret, so nobody who can see the WordPress settings (where the
// plugin's shared secret lives) can make passes. Without one, a random key
// is used: passes then stop working at every restart, so set it in production.
const configured = process.env.GARDEN_PASS_SECRET || "";
if (configured && configured.length < 32) throw new Error("GARDEN_PASS_SECRET must be at least 32 characters");
if (!configured && process.env.NODE_ENV === "production") console.warn("GARDEN_PASS_SECRET is not set: garden passes will stop working at every restart.");
const SECRET = configured || crypto.randomBytes(32).toString("hex");

const sign = (payload) => crypto.createHmac("sha256", `pass:${SECRET}`).update(payload).digest("base64url");

function createPass(beehiivSubscriberId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ s: beehiivSubscriberId, e: Math.floor(now / 1000) + LIFETIME_SECONDS })).toString("base64url");
  return { pass: `${PREFIX}${payload}.${sign(payload)}`, expiresIn: LIFETIME_SECONDS };
}

const isPass = (value) => typeof value === "string" && value.startsWith(PREFIX);

// The subscriber a pass names, or null if it's forged, damaged or expired.
function readPass(token, now = Date.now()) {
  if (!isPass(token)) return null;
  const [payload, signature] = token.slice(PREFIX.length).split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { s, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof s !== "string" || !s || typeof e !== "number" || e * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}

// router.param handler for every private /api/tree/:beehiivSubscriberId
// route: the subscriber comes from a valid pass, never from the path. A raw
// subscriber ID is refused, so knowing someone's ID gets you nowhere.
function resolvePassParam(req, res, next) {
  const token = String(req.headers["x-garden-pass"] || "");
  const id = readPass(token);
  if (!id) {
    const expired = isPass(token);
    return res.status(401).json({
      error: expired ? "pass_expired" : "pass_required",
      message: expired ? "This garden link has expired. Open your garden again from your newsletter or account page." : "Open your garden from the link in your newsletter or your account page.",
    });
  }
  req.params.beehiivSubscriberId = id;
  next();
}

module.exports = { createPass, readPass, resolvePassParam, LIFETIME_SECONDS };
