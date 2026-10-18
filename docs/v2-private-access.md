# v2 private access

The local v2 app has an access module. A trusted caller can issue a 24-hour, one-use link for an existing Beehiiv reader ID. The link puts a 32-byte random token in the URL fragment. The app stores only its SHA-256 digest. Issuing a new trusted link invalidates earlier unused links. Recovery keeps an earlier link valid until delivery of its replacement succeeds. Claiming a link creates a 30-day HttpOnly, SameSite=Lax session cookie; a private garden read uses that session and opens a zero-point seed garden when needed. Successful recovery link requests are limited to one new link per reader every 15 minutes. Expired tokens are removed during link issuance. Private edit routes use the same `requireReader` middleware and `req.v2ReaderId`, never a reader ID from the URL or request body.

`GARDEN_PUBLIC_URL` must be the public HTTPS garden URL before production access routes mount. The old subscriber-ID tree, viewed, and harvest routes return 410 in this branch. The signed WordPress tree-status route remains mounted.

## Gates before a reader pilot

- Connect trusted newsletter-link issuance and delivery. `issueLink(readerId)` exists, but no newsletter process calls it or sends its URL yet.
- Connect recovery delivery. The app has no configured transactional sender. The recovery route returns 503 until both `sendLink` and `verifyReaderEmail` adapters are installed.
- Make `verifyReaderEmail` check the **current authoritative Beehiiv reader ID and email** before sending. The legacy `subscribers.email` is set by earlier events and may be stale after an address change. A mismatch or lookup failure must send no link.
- Wire the browser to exchange `#access=...` with `/api/v2/access/claim`, remove the fragment from browser history, and show an access/recovery screen on 401. The current v2 UI still uses example data.
- Verify a real test-subscriber link, recovery email, expired-link behavior, and private garden read on the pilot deployment. No live email was sent during local implementation.
- Confirm the deployed app has retired the old ID-based routes. Local tests do not prove which commit is live.

The disposable Express and SQLite access tests cover claiming, token expiry and rotation, zero-credit seed access, unknown/stale email privacy, and preservation of the signed WordPress route. They do not prove live Beehiiv identity data or mail delivery.
