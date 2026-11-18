// Short-lived signed passes, so the WordPress plugin can show a logged-in
// reader their own garden without putting their subscriber ID in a link.
//
// A pass looks like  p1.<payload>.<signature>  and can be used anywhere the
// page or the API takes a subscriber ID (see resolvePassParam). It names one
// subscriber and expires; nobody can make or change one without the secret.

const crypto = require("crypto");

const PREFIX = "p1.";
const LIFETIME_SECONDS = 12 * 60 * 60; // long enough for a visit, short enough that a copied link soon stops working

// The same secret the plugin signs its requests with. Without one (local
// development only) a random secret is used, so passes last until a restart.
const SECRET = process.env.WP_APP_SHARED_SECRET || crypto.randomBytes(32).toString("hex");

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

// router.param handler: lets every /api/tree/:beehiivSubscriberId route take
// a pass in place of the ID.
function resolvePassParam(req, res, next, value) {
  if (!isPass(value)) return next();
  const id = readPass(value);
  if (!id) return res.status(401).json({ error: "this garden link has expired — reopen your garden from your account page" });
  req.params.beehiivSubscriberId = id;
  next();
}

module.exports = { createPass, readPass, resolvePassParam, LIFETIME_SECONDS };
