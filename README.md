# Scrobble to Spotify

A browser app that reads any Last.fm user's top tracks, matches them to Spotify, and creates a private playlist in the connected Spotify account.

## Run

With Node.js installed, open a terminal in this folder and run:

    node server.cjs

Open http://127.0.0.1:4173 and choose App setup.

1. Apply for a Last.fm API key at https://www.last.fm/api/account/create. Choose Web app if asked. The app reads public listening history and does not require a Last.fm authentication callback or shared secret.
2. Create a Spotify developer app at https://developer.spotify.com/dashboard. Copy its Client ID; do not enter a client secret.
3. Register the exact redirect URI displayed by App setup: http://127.0.0.1:4173/ when running locally. Spotify accepts HTTP for explicit loopback IP addresses. Do not substitute localhost.
4. In Spotify development mode, meet Spotify's current account requirements and add authorized listeners in User Management. The developer app owner needs Premium.
5. Save setup, enter a Last.fm username, choose a period and track count, and connect Spotify. Review the matched tracks and create your playlist.

For hosting, serve the dist directory over HTTPS and register its exact URL as a Spotify redirect URI. API keys and Client IDs are entered by each browser user and saved locally. Spotify tokens and unfinished drafts use session storage. No backend database is required.

The app supports 25, 50, or 100 top tracks. Select Custom dates to choose an inclusive start and end date in the Australia/Melbourne time zone. The app reads all pages of scrobbles in that range and ranks songs by play count, excluding now-playing entries. Longer ranges show progress and can be cancelled. It includes only matching titles and artists, allowing remastered title suffixes. Missing or ambiguous recordings may be skipped; inspect the Spotify links in the preview. Duplicate Spotify tracks are excluded.

If saving tracks fails after playlist creation, Retry saving tracks reuses the existing playlist. If the initial creation request times out, check your Spotify library before retrying. Session storage is cleared when the browser session ends.

## Verification

JavaScript syntax and a simulated end-to-end API flow passed: loading Last.fm tracks, matching, excluding missing tracks, deduplicating, private playlist creation, and retrying a failed track save without another playlist. Live Last.fm and Spotify authorization require your credentials and have not been tested.

## API references

- https://www.last.fm/api/show/user.getTopTracks
- https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- https://developer.spotify.com/documentation/web-api/reference/create-playlist
- https://developer.spotify.com/documentation/web-api/reference/reorder-or-replace-playlists-tracks
