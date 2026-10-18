# My Almond Forest v2 page

Open `/v2/` in the app. It requests authenticated `/api/v2/garden` data and shows private access guidance without a session. A one-time link carries `#access=…`; the loader removes this fragment before claiming it. The page never calls the legacy subscriber-ID routes.

`/v2/?sample=forest` and `/v2/?sample=seed` show clearly labelled example readers. `/v2/?sample=choice` demonstrates the required first resident choice, and `&still=1` forces the still view. Example changes last only until reload. `garden-data.mjs` loads the reader's garden; `design-mode.mjs` loads and saves earned choices and placements. Missing newsletter totals display as unavailable. A previous visit triggers a short growth replay; a first forest gets one welcome reveal. A required reward choice must be saved before the page acknowledges the visit. Verified Beehiiv counters and the historical-award dry run remain launch gates.

`forest.mjs` is the 3D scene adapter. The SVG in `index.html` is the still-view adapter. Both support the numbered tree collection and saved placement. Design Your Garden lets a reader choose blossoms and resident, move owned items to server-approved spots, and undo before saving. The sample share button opens an EXAMPLE ONLY card with a visible Save image link. Real sharing stays disabled until subscriber year, newsletter counts, coverage, and latest milestone are verified.

The vendored Three.js files retain their MIT license in `vendor/LICENSE`. Logo, background, and fonts were copied from the existing v2 prototype's 10almonds brand assets.
