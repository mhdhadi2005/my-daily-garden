// Run this yourself with: npm run verify:beehiiv
// Uses the real beehiiv credentials from your local .env — nothing here
// gets sent anywhere except directly to beehiiv's own API.
//
// This exists to answer two questions before we rely on the integration:
//   1. Does the API key + publication ID actually authenticate?
//   2. Does the real response shape match what beehiiv.js assumes?
//      (see the NOTE comments in src/integrations/beehiiv.js — this script
//      prints the raw response so we can confirm or fix those assumptions.)

require("dotenv").config();

const API_KEY = process.env.BEEHIIV_API_KEY;
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;

if (!API_KEY || !PUBLICATION_ID) {
  console.error("Missing BEEHIIV_API_KEY or BEEHIIV_PUBLICATION_ID in .env — add them first.");
  process.exit(1);
}

// Safely parses a response as JSON, falling back to raw text if it isn't —
// prevents a confusing crash if something in between (a proxy, a firewall,
// beehiiv itself) ever returns a non-JSON error page.
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _nonJsonResponse: true, raw: text.slice(0, 500) };
  }
}

async function main() {
  console.log(`Testing against publication: ${PUBLICATION_ID}\n`);

  // 1. Confirm the key authenticates and the publication ID is right.
  console.log("--- Step 1: Fetching publication details ---");
  const pubRes = await fetch(`https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  console.log(`Status: ${pubRes.status} ${pubRes.statusText}`);
  const pubData = await safeJson(pubRes);
  console.log(JSON.stringify(pubData, null, 2));

  if (!pubRes.ok) {
    console.error("\n❌ Authentication failed — double check the key and publication ID.");
    process.exit(1);
  }
  console.log("\n✅ Authenticated successfully.\n");

  // 2. List a few subscribers, if any exist, so we can see the real shape
  //    of subscriber data (including custom_fields and stats, if present).
  console.log("--- Step 2: Listing up to 3 subscribers (to check response shape) ---");
  const subsRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/subscriptions?limit=3&expand=stats`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  console.log(`Status: ${subsRes.status} ${subsRes.statusText}`);
  const subsData = await safeJson(subsRes);
  console.log(JSON.stringify(subsData, null, 2));

  if (subsData?.data?.length > 0) {
    console.log(`\n✅ Found ${subsData.data.length} subscriber(s) to test against.`);
    console.log("Copy the full JSON output above and send it back — that's what I need to");
    console.log("confirm src/integrations/beehiiv.js is reading the right field names.");
  } else {
    console.log("\n⚠️  No subscribers in this test publication yet. Add at least one test");
    console.log("subscriber in the beehiiv dashboard, then re-run this to test the");
    console.log("custom-fields sync (Step 3 below will be skipped without one).");
  }

  // 3. If a subscriber exists, test the REAL syncSubscriberStats function
  //    (not a duplicate inline fetch) so this actually verifies the fixed
  //    code, including the new warnings check.
  if (subsData?.data?.length > 0) {
    const testSubscriberId = subsData.data[0].id;
    console.log(`\n--- Step 3: Test custom-field sync on subscriber ${testSubscriberId} ---`);
    console.log("(using the real syncSubscriberStats() from src/integrations/beehiiv.js)\n");
    const { syncSubscriberStats } = require("./integrations/beehiiv");
    try {
      const result = await syncSubscriberStats(testSubscriberId, { streak: 1, tree_stage: "Seed" });
      console.log(JSON.stringify(result, null, 2));
      console.log("\n✅ Custom field sync succeeded with no warnings — fields exist and saved correctly.");
    } catch (err) {
      console.log(`\n⚠️  ${err.message}`);
      console.log("\nThis is expected if the custom fields haven't been created in the beehiiv");
      console.log("dashboard yet (Audience → Custom Fields). Create 'streak', 'points' (Number),");
      console.log("and 'tree_stage' (Text), then re-run this script to confirm the fix.");
    }
  }
}

main().catch((err) => {
  console.error("Script error:", err.message);
  process.exit(1);
});
