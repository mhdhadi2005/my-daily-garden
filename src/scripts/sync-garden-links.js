// Puts every reader's personal garden link into beehiiv, in a custom field
// named garden_link, so newsletters can link to the garden with {{garden_link}}.
// New readers get theirs automatically the first time their stats sync; run
// this once for readers who already exist (and again any time, it's safe).
//
// Needs BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID, and the custom field
// "garden_link" created in beehiiv first (Audience → Custom fields).
//
//   node src/scripts/sync-garden-links.js            (live: railway ssh -- node src/scripts/sync-garden-links.js)

const { db, initSchema } = require("../db");
const { gardenLink } = require("../engine");
const { syncSubscriberStats } = require("../integrations/beehiiv");

initSchema();
(async () => {
  const subs = db.prepare("SELECT beehiiv_subscriber_id, garden_token FROM subscribers").all();
  let done = 0, failed = 0;
  for (const sub of subs) {
    try {
      await syncSubscriberStats(sub.beehiiv_subscriber_id, { garden_link: gardenLink(sub) });
      done++;
    } catch (err) {
      failed++;
      console.warn(`${sub.beehiiv_subscriber_id}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 250)); // gentle on beehiiv's rate limit
  }
  console.log(`garden_link sent for ${done} readers, ${failed} failed.`);
})();
