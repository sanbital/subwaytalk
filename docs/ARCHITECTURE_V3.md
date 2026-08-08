# Subwaytalk v3 architecture

## Why this transition exists

The current production page is a large prebuilt `app.js` bundle. Replacing it all at once would risk regressions in chat, voting, moderation and the existing test flow. v3 therefore introduces small runtime modules first, then moves the legacy source into a normal build system in a later step.

## Active runtime modules

### `runtime/location-engine.js`

- Starts only after the user presses the existing location-consent CTA.
- Reads the device geolocation stream without overriding the browser geolocation API.
- Matches a moving user to **rail segments**, not only the single nearest station.
- Scores continuity with the previously matched line so transfer stations do not jump to whichever line happens to be listed first.
- Uses successive progress along the matched segment, plus device heading when available, to infer travel direction.
- Normalizes physical railway section names to passenger-facing line names (for example `경부선` -> `1호선`).
- Normalizes station display names by removing parenthetical facility aliases so targeting keys such as `강변` match `강변(동서울터미널)`.
- Does not persist raw latitude/longitude.

### `runtime/location-ui.js`

- Replaces the unreliable legacy mini-track once v3 has a real location match.
- Shows matched line, next-station direction, nearby/current station, GPS accuracy and low-confidence state.
- Uses the v3 station for the get-off and arrival copy.

### `runtime/ad-runtime.js`

- Hides the legacy location ad surface and renders only v3-qualified campaigns.
- An ad must match station, optional line, campaign radius and a non-low location confidence.
- Default campaign radius is 220 m and is configurable per campaign.
- Impression/click events store only station/line, anonymous session hash, GPS accuracy and distance-to-station. Raw coordinates are not sent to Supabase.
- A campaign impression is deduplicated per session/station.

## Supabase isolation

Subwaytalk currently shares a Supabase project with unrelated services. v3 therefore uses only tables prefixed with `subway_`:

- `subway_ads`
- `subway_ad_events`
- `subway_music_rules`

RLS is enabled on all three. Anonymous clients can only:

- `SELECT` currently active `subway_ads`
- `INSERT` `subway_ad_events`
- `SELECT` currently enabled `subway_music_rules`

No Subwaytalk migration in this change modifies Idol Camp, scoreboard or meme-event tables.

## Music automation design

The reliable model is **contextual playlist selection**, not creating a brand-new YouTube playlist for every rider.

1. Maintain a curated pool of YouTube/YouTube Music playlist URLs in `subway_music_rules`.
2. Tag rules with combinations of:
   - time of day (`morning`, `evening`, etc.)
   - line
   - station/area
   - weather tag
   - editorial hashtags/moods
3. The client sends only context keys to the selector; the rule with the highest specificity/priority wins.
4. A scheduled server function can refresh candidate playlists from the YouTube Data API. Keep API keys/server credentials off the client.
5. If Subwaytalk must create or modify playlists on a YouTube channel, that write path uses OAuth and should run server-side under a controlled channel account.
6. Weather should be resolved server-side or through a weather provider using coarse station/area context; do not upload a rider's exact coordinates for playlist selection.

The DB rule layer is added in this change. Switching the legacy embedded player to the selected rule should happen when the large `app.js` bundle is extracted into the normal source build, so music playback is not patched through brittle DOM manipulation.

## Next structural step

After v3 location/ad validation on real devices:

1. Move lounge/admin/advertiser source into `src/` entrypoints.
2. Add Vite (or equivalent) build output and stop committing hand-built 400 KB bundles as source of truth.
3. Move shared station normalization, Supabase client and domain types into common modules.
4. Replace the legacy `kv` JSON store with dedicated tables + Realtime/Broadcast incrementally.
5. Replace static admin/advertiser access codes with authenticated roles and server-enforced RLS.

## Validation

`npm run check` syntax-checks each v3 runtime module. GitHub Actions runs the same check on branches and pull requests.
