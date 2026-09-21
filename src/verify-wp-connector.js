// Simulates exactly what the WordPress connector snippet sends to
// /api/wp/tree-status, so the signature handshake can be proven end to end
// without touching the WordPress site.
//
//   node src/verify-wp-connector.js <wp_user_id> [app_url]
//
// Reads WP_APP_SHARED_SECRET from .env — it must match MDG_SHARED_SECRET in
// wordpress-snippet/my-daily-garden-connector.php.

require("dotenv").config();
const crypto = require("crypto");

const wpUserId = Number(process.argv[2] || 1);
const appUrl = (process.argv[3] || process.env.APP_URL || "http://localhost:3001").replace(/\/$/, "");
const secret = process.env.WP_APP_SHARED_SECRET;

if (!secret) {
  console.error("WP_APP_SHARED_SECRET is not set in .env — set it to the same value as MDG_SHARED_SECRET in the PHP snippet.");
  process.exit(1);
}

// Mirrors the PHP: $payload = $timestamp . ':' . wp_json_encode($body)
const body = JSON.stringify({ wp_user_id: wpUserId });
const timestamp = Math.floor(Date.now() / 1000);
const signature = crypto.createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex");

(async () => {
  console.log(`POST ${appUrl}/api/wp/tree-status  (wp_user_id=${wpUserId})`);

  const res = await fetch(`${appUrl}/api/wp/tree-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-WP-Signature": signature,
      "X-WP-Timestamp": String(timestamp),
    },
    body,
  });

  const text = await res.text();
  console.log(`\nStatus: ${res.status}`);
  console.log(`Response: ${text}\n`);

  if (res.status === 401) {
    console.log("✗ Signature rejected. Check that WP_APP_SHARED_SECRET here matches");
    console.log("  MDG_SHARED_SECRET in the PHP snippet, and that both machines' clocks");
    console.log("  are within 60s of each other.");
    process.exit(1);
  }
  if (!res.ok) {
    console.log("✗ Request failed — see the response above.");
    process.exit(1);
  }

  const data = JSON.parse(text);
  if (data.linked === false) {
    console.log("✓ Handshake works. This WordPress user has no garden yet —");
    console.log("  expected until their email is linked via a newsletter click.");
  } else {
    console.log(`✓ Handshake works and the account is linked: ${data.stage}, ${data.points} pts, ${data.streak} day streak.`);
  }
})().catch((err) => {
  console.error("✗ Could not reach the app:", err.message);
  process.exit(1);
});
