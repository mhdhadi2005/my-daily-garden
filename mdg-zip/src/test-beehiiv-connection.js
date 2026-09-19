// Standalone connectivity test — run this on your own machine (not in a
// sandboxed environment) since it needs real internet access to reach
// beehiiv's API. Doesn't touch the database or the rest of the app; just
// confirms the API key + publication ID work and shows the real response
// shape, so we can double check the integration code matches reality.
//
// Usage:
//   1. Create a .env file (copy .env.example) and fill in:
//        BEEHIIV_API_KEY=your key
//        BEEHIIV_PUBLICATION_ID=your publication id
//   2. node src/test-beehiiv-connection.js

require("dotenv").config();

const API_KEY = process.env.BEEHIIV_API_KEY;
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;

if (!API_KEY || !PUBLICATION_ID) {
  console.error("Missing BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID in your .env file.");
  process.exit(1);
}

async function main() {
  console.log(`Testing connection to publication: ${PUBLICATION_ID}\n`);

  // 1. Confirm the key works and can see this publication at all.
  console.log("--- Fetching publication details ---");
  const pubRes = await fetch(`https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  console.log(`Status: ${pubRes.status}`);
  const pubData = await pubRes.json();
  console.log(JSON.stringify(pubData, null, 2));

  if (!pubRes.ok) {
    console.error("\n❌ Could not reach the publication — check the key and publication ID.");
    process.exit(1);
  }

  // 2. List a few subscribers, so we can see the real shape of subscriber
  //    data (custom fields, stats, etc.) — this is what our woocommerce.js/
  //    beehiiv.js code needs to match.
  console.log("\n--- Fetching up to 3 subscribers (to inspect real field names) ---");
  const subsRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions?limit=3&expand[]=stats`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  console.log(`Status: ${subsRes.status}`);
  const subsData = await subsRes.json();
  console.log(JSON.stringify(subsData, null, 2));

  console.log("\n✅ Done. Paste this full output back so the integration code can be checked against it.");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
