const crypto = require('node:crypto');
const express = require('express');

const LINK_SECONDS = 24 * 60 * 60;
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const RECOVERY_COOLDOWN_SECONDS = 15 * 60;
const COOKIE_NAME = 'mdg_v2_session';

function createAccess({ db, ensureGarden, sendLink, verifyReaderEmail, publicUrl, now = Date.now }) {
  if (!db || typeof ensureGarden !== 'function' || !publicUrl) throw new Error('access is not configured');
  const gardenUrl = new URL(publicUrl);
  const localHttp = process.env.NODE_ENV !== 'production' &&
    (gardenUrl.hostname === 'localhost' || gardenUrl.hostname === '127.0.0.1');
  if (gardenUrl.protocol !== 'https:' && !localHttp) {
    throw new Error('private garden URL must use HTTPS');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS v2_access_tokens (
    digest TEXT PRIMARY KEY,
    reader_id TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('link', 'session')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_v2_access_reader ON v2_access_tokens(reader_id, purpose);
  CREATE INDEX IF NOT EXISTS idx_v2_access_expiry ON v2_access_tokens(expires_at);`);

  const router = express.Router();
  router.use('/api/v2', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });

  function seconds() { return Math.floor(now() / 1000); }
  function digest(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
  function validToken(token) { return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token); }
  function token() { return crypto.randomBytes(32).toString('base64url'); }
  function issueLink(readerId, { preserveExisting = false } = {}) {
    const reader = db.prepare('SELECT 1 FROM subscribers WHERE beehiiv_subscriber_id = ?').get(readerId);
    if (!reader) throw new TypeError('unknown reader');
    const secret = token();
    const issuedAt = seconds();
    db.prepare('DELETE FROM v2_access_tokens WHERE expires_at <= ?').run(issuedAt);
    if (!preserveExisting) {
      db.prepare("DELETE FROM v2_access_tokens WHERE reader_id = ? AND purpose = 'link'").run(readerId);
    }
    db.prepare('INSERT INTO v2_access_tokens VALUES (?, ?, ?, ?, ?)')
      .run(digest(secret), readerId, 'link', issuedAt, issuedAt + LINK_SECONDS);
    const url = new URL(gardenUrl);
    url.hash = `access=${secret}`;
    return { url: url.toString(), digest: digest(secret) };
  }

  router.post('/api/v2/access/recover', async (req, res) => {
    if (typeof sendLink !== 'function' || typeof verifyReaderEmail !== 'function') {
      return res.status(503).json({ error: 'recovery_unavailable' });
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    // The same response for known and unknown addresses avoids disclosing readership.
    const rows = db.prepare('SELECT beehiiv_subscriber_id AS readerId, email FROM subscribers WHERE lower(email) = ? LIMIT 2').all(email);
    if (rows.length === 1) {
      const reader = rows[0];
      const latest = db.prepare("SELECT max(created_at) AS at FROM v2_access_tokens WHERE reader_id = ? AND purpose = 'link'").get(reader.readerId);
      if (latest.at === null || seconds() - latest.at >= RECOVERY_COOLDOWN_SECONDS) {
        // This adapter must check the current Beehiiv reader ID and email, not the old local row alone.
        try {
          if (await verifyReaderEmail({ readerId: reader.readerId, email: reader.email }) !== true) {
            return res.status(202).json({ ok: true });
          }
        } catch {
          console.warn('Private garden recovery email verification failed');
          return res.status(202).json({ ok: true });
        }
        const link = issueLink(reader.readerId, { preserveExisting: true });
        try {
          await sendLink({ email: reader.email, url: link.url });
          db.prepare("DELETE FROM v2_access_tokens WHERE reader_id = ? AND purpose = 'link' AND digest <> ?")
            .run(reader.readerId, link.digest);
        } catch {
          db.prepare('DELETE FROM v2_access_tokens WHERE digest = ?').run(link.digest);
          console.warn('Private garden recovery delivery failed');
        }
      }
    }
    res.status(202).json({ ok: true });
  });

  router.post('/api/v2/access/claim', (req, res) => {
    const secret = req.body?.token;
    if (!validToken(secret)) return res.status(401).json({ error: 'invalid_link' });
    const claimed = db.prepare("DELETE FROM v2_access_tokens WHERE digest = ? AND purpose = 'link' AND expires_at > ? RETURNING reader_id")
      .get(digest(secret), seconds());
    if (!claimed) return res.status(401).json({ error: 'invalid_link' });
    const session = token();
    const issuedAt = seconds();
    db.prepare('INSERT INTO v2_access_tokens VALUES (?, ?, ?, ?, ?)')
      .run(digest(session), claimed.reader_id, 'session', issuedAt, issuedAt + SESSION_SECONDS);
    res.cookie(COOKIE_NAME, session, {
      httpOnly: true, sameSite: 'lax', secure: gardenUrl.protocol === 'https:',
      path: '/api/v2', maxAge: SESSION_SECONDS * 1000,
    });
    res.status(204).end();
  });

  function requireReader(req, res, next) {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    const cookie = req.headers.cookie?.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
    if (!validToken(cookie)) return res.status(401).json({ error: 'private_garden' });
    const session = db.prepare("SELECT reader_id FROM v2_access_tokens WHERE digest = ? AND purpose = 'session' AND expires_at > ?")
      .get(digest(cookie), seconds());
    if (!session) return res.status(401).json({ error: 'private_garden' });
    req.v2ReaderId = session.reader_id;
    next();
  }

  router.get('/api/v2/garden', requireReader, (req, res) => {
    const garden = ensureGarden(req.v2ReaderId);
    if (!garden) return res.status(404).json({ error: 'garden_not_found' });
    res.json(garden);
  });

  return { router, issueLink, requireReader };
}

module.exports = { createAccess };
