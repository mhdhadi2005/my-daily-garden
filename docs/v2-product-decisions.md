# My Daily Garden v2 decisions

Agreed product brief, confirmed 16 October 2026. These decisions supersede conflicting scoring, migration, and sharing proposals in the earlier forest-planning draft. The scoring pace remains subject to the API proof and historical award dry-run below. No app implementation or live subscriber change follows from this document alone.

The confirmed page and interaction choices are in [My Almond Forest: v2 experience design](v2-experience-design.md).

## Purpose and experience

- Build for 10almonds readers only. The pilot's main outcome is Beehiiv verified total email link clicks per delivered email, across all links including the garden. This is broad email interaction, not a measure of article reading.
- Build the full warm 3D almond woodland: six visibly different tree families, two resident choices, three blossom palettes, and connected meadow, pond, and woodland areas. Use the soft-sculpted image as a reference and compare browser-rendered directions before choosing the final look.
- Earned trees and items persist. A new tree auto-appears in a valid spot; the reader can later move earned trees and decorations and undo an edit. Rotation is not an initial editing control. Terrain and paths grow automatically. No random drops or second currency at launch.
- Garden points accumulate for life. Test the pace of a first completed tree at 60 points, then one more every 250 points. Completing a tree never spends points.

## Earning after launch

- A Beehiiv-reported unique email open earns 2 points once per email. Sync daily; opens do not advance the click streak.
- Each increase in a subscriber's Beehiiv click total provisionally earns 10 points, capped at five new click credits per successful UTC daily report. Repeat clicks and non-article email links, including the garden link, count. This is a reported increase, not proof of which link was clicked or the click's exact date.
- A positive daily click report advances the reported click streak. Award 5 extra points at the seventh positive report and every seventh thereafter. A failed API report pauses scoring; a successful report without new clicks breaks the streak. A break never removes earned growth.
- A correct response to a real, editor-approved quiz earns 15 points once per quiz. Beehiiv-reported clicks on quiz-answer, referral, store, and garden links can also earn normal click points within the daily cap. A click and a correct answer are separate awards.
- Each unique verified referral earns 50 points once. A verified completed purchase earns 2 points per $1 of paid merchandise, once per order. Invalid amounts earn nothing; unmatched billing emails are held for support rather than creating a garden. Later refunds do not erase awarded growth.

## Starting forest

- The tree game has not launched, so there is no garden balance to migrate. Existing readers receive one welcome reveal of starting growth from recorded newsletter opens and clicks only. Past purchases and referrals are excluded, and there is no backdated streak bonus.
- Dry-run 2 points per exact lifetime unique open plus 10 per exact lifetime Beehiiv click, if those counts are confirmed. Historical clicks cannot be given a daily cap without dated records. Never estimate missing counts from rates, and show the coverage of any incomplete source. Review the full-audience tree distribution before granting points.

## Access and sharing

- The garden is private to its reader through a subscriber-specific link. An expired link can be replaced through verified email. Unsubscribing preserves the forest and allows a recovered view; newsletter earning pauses until resubscription.
- The static share card uses the chosen forest view, fixed “My Almond Forest” title, subscriber-since year, recorded unique email opens, Beehiiv-reported newsletter clicks, trees grown, and latest significant milestone. Show coverage when a historical count is incomplete. It shows no personal name, click-day count, subscriber ID, or private link. Offer image save and native sharing, without a public interactive forest at launch.
- No extra reminder emails, push alerts, public leaderboard, or ranking at launch. The existing newsletter is the return path.

## Proof before a reader pilot

- Verify with a test subscriber that the production Beehiiv API exposes exact cumulative unique-open and click counts, including in cursor-paginated subscriber listings; establish whether they include automation or web-post clicks. Confirm a daily full-audience sweep fits the rate limit. The current public subscription schema does not guarantee these fields. If they are absent or unstable, do not silently substitute rates or launch click rewards.
- Dry-run historical awards and the 60/250 tree pace against representative readers, including low-click and long-tenure readers. Check scanner-inflated raw click totals against Beehiiv verified post metrics.
- Run a limited measured pilot before full rollout. Use verified total email clicks per delivered email across every link, including the garden, as the main outcome; also check mobile performance, incorrect awards, and private access. Choose pilot size from real baseline data.
