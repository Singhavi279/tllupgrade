# Times Internet Languages Live

Single-page site for timeslanguages.in. Pure HTML5 / CSS3 / vanilla ES modules — no framework, no bundler, no dependencies.

## The two config files

Everything on the page comes from one of these. There are no content strings in the JavaScript.

| File | Owns |
| --- | --- |
| `config.json` | Page content and behaviour: the ordered list of sections, every heading, body copy, event card, speaker, logo, FAQ, contact, form definition, theme colours and fonts, and `global.ui` (the labels the components generate themselves, e.g. `"Hello in {language}"`). |
| `seoconfig.json` | Everything a crawler or answer engine sees: title, meta, Open Graph, Twitter, canonical/hreflang, which JSON-LD blocks to emit, sitemap pages, robots rules, the `llms.txt` outline, and the `performance` switches below. |

`config.json.page.sections[].component` names a function in the registry at the top of `js/app.js`. Add a section by adding an entry there and an emitter of the same name in `scripts/prerender.mjs`.

## Build

```
node scripts/build-seo.mjs
```

Required after editing `config.json`, `seoconfig.json` or `css/styles.css`. It writes `sitemap.xml`, `robots.txt`, `llms.txt`, and rewrites two generated regions of `index.html`:

- `<!-- SEO:START … SEO:END -->` — title/meta/OG/Twitter/hreflang/JSON-LD, the inlined stylesheet, the LCP image preload.
- `<!-- APP:START … APP:END -->` — static markup for every section, so the first paint and crawlers do not wait on JavaScript. `js/app.js` replaces it with the live components on boot.

Never hand-edit inside those markers; the next build overwrites them.

## Dev server

```
node scripts/serve.mjs      # http://localhost:8080
```

Serves text responses gzipped (so local timings resemble production) and re-runs the build automatically whenever a source file is newer than `index.html`.

## Admin CMS (`/admincms/`)

A small editor for `config.json` (page content, images, UI labels, theme) and `seoconfig.json` (title, meta, Open Graph, JSON-LD switches, robots, `llms.txt`, performance). Left side lists the sections; the right side is a form for the selected one. Lists can be added to, reordered, duplicated and removed; image fields show a preview and a **Replace image…** button.

**Sign-in is a placeholder.** Enter any 10-digit phone number and the default OTP `123456`. The site is static, so nothing is sent and nothing is verified server-side — anyone who reads `admincms/admincms.js` can bypass it. It keeps casual visitors out, not attackers. Before relying on it, swap `verifyOtp` in `admincms/admincms.js` for a real OTP service and have that service authorise saves.

**How edits get saved depends on where it runs:**

| Where | Save button | Result |
| --- | --- | --- |
| `node scripts/serve.mjs` (local) | **Save config.json** | Written to disk, `build-seo.mjs` re-run. Uploaded images land under `assets/`. Endpoints answer only to localhost, same-origin requests carrying an `x-admincms` header, and only touch the two JSON files and `assets/*` images. |
| GitHub Pages / any static host | none — **Download JSON** | Replace the file in the repo with the download, run `node scripts/build-seo.mjs`, commit. A picked image is downloaded too; add it under the path the field now shows. |

**Version history.** The **History** button lists the last 3 states the current file had before it was overwritten, with how many fields differ from the editor. **Restore** loads a version into the editor as an unsaved change; Save (or Download) applies it, and the state it replaced becomes a version in turn. A save that changes nothing creates no version.

- Local mode: the dev server snapshots the file on each changing save into `.admincms-history/<file>/` (git-ignored, never published).
- Download mode: no server exists, so the browser keeps the state each file was loaded in (taken on the first edit of a session) in `localStorage` — per browser, not shared.

**Live refresh.** After a local save the admin announces it on a same-origin `BroadcastChannel`; any open tab of the site reloads and shows the change. On a static host nothing on the live site changes until the files are committed and deployed.

The page carries `<meta name="robots" content="noindex, nofollow">`. `robots.txt` allows everything, so crawlers can fetch the page and read that tag.

## Performance switches (`seoconfig.json` → `performance`)

- `inlineCss` — inline a minified `css/styles.css` into `<head>`, removing the one render-blocking request.
- `preloadLcpImage` — emit `<link rel="preload" as="image">` (with `imagesrcset`) for the first hero slide.
- `prerender` — generate the static `#app` markup.
- `preconnect` — origins to warm up early.

## Images

Hero and people photos ship as WebP at two widths (`*-sm.webp` 960w, `*.webp` 1600w); the `srcset`/`sizes`/`width`/`height` for each hero slide live in `config.json`. The original JPEGs are kept in the repo as re-encoding sources and are not referenced by the page.

## Known gaps before launch

- The four About figures, the speaker names/photos and the brand logos are clearly marked placeholders in `config.json`.
- `/api/forms/partner-enquiry` and `/api/newsletter/optin` do not exist yet; the form and SSO opt-in post to them.
- No analytics tag is installed.
