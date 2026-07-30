# mesh-cprt

Custom JavaScript for the [CPRT](https://cprt.webflow.io) Webflow site, built on
the [Sygnal Site Engine](https://engine.sygnal.com/) and served from Cloudflare
Pages.

Everything the site loads is one bundle, `dist/index.js`, plus the stylesheet
the engine injects alongside it. `dist/` is generated and git-ignored —
Cloudflare builds it on every push.

## Setup

```sh
npm install
```

## Development

```sh
npm run build    # typecheck + SCSS + bundle
npm run watch    # rebuild on change
```

With `watch` running, load the site with `?engine=dev` (or from localhost) and
the loader in Webflow points at `http://127.0.0.1:3000/dist/index.js` instead of
the CDN.

## Deploy

| Branch | URL | Used by |
| --- | --- | --- |
| `staging` | `https://staging.mesh-cprt.pages.dev/index.js` | `cprt.webflow.io` |
| `main` | `https://mesh-cprt.pages.dev/index.js` | the production domain |

Push to `staging`; merge `staging` into `main` to promote. A Cloudflare build
takes one to two minutes, so verify what is actually being served rather than
trusting a green push:

```sh
SHA=$(git rev-parse --short HEAD)
curl -fsS https://staging.mesh-cprt.pages.dev/index.js | grep -q "$SHA" && echo "LIVE: $SHA"
```

The same SHA prints in the browser console as `[engine] CPRT v… build <sha>`.

The `?engine=` query parameter forces an environment from any URL —
`?engine=staging`, `?engine=prod`, `?engine=dev` — which is how you check a
staging build against production content.

## Structure

```
src/
  index.ts          entry point — boots the engine, logs the build stamp
  registry.ts       imports every module; a file not imported here never runs
  site.ts           site-level setup; injects the stylesheet
  components/       one file per behavior, bound by sse-component
  lib/              gsap accessor, data-attribute config reader
  css/site.scss     compiled to dist/css/site.css, injected by the engine
docs/               Webflow ↔ JS contracts for each component
```

## Components

| Component | `sse-component` | Webflow element | Docs |
| --- | --- | --- | --- |
| Hover Tab | `hover-tab` | Hover Tab Layout root (`hover-tab_wrap`) | [docs](docs/hover-tab-webflow.md) |
| Nav Hover Image | `nav-hover-image` | Nav mega dropdown (`nav_dropdown_mega_wrap`) | [docs](docs/nav-hover-image-webflow.md) |

GSAP is loaded by Webflow, never bundled — components read it through
`getGsap()`, which warns and disables that one animation if it is missing.

## Webflow loader

Installed once in Site Settings → Custom Code → before `</head>`. It picks the
environment by hostname, so it never needs editing again:

```html
<script>
(function () {
  var PROJECT = "mesh-cprt";
  var host = location.hostname;
  var mode = new URLSearchParams(location.search).get("engine");
  var src;

  if (mode === "dev" || host === "127.0.0.1" || host === "localhost") {
    src = "http://127.0.0.1:3000/dist/index.js";
  } else if (mode === "staging") {
    src = "https://staging." + PROJECT + ".pages.dev/index.js";
  } else if (mode === "prod") {
    src = "https://" + PROJECT + ".pages.dev/index.js";
  } else if (host.indexOf(".webflow.io") !== -1) {
    src = "https://staging." + PROJECT + ".pages.dev/index.js";
  } else {
    src = "https://" + PROJECT + ".pages.dev/index.js";
  }

  document.write('<script src="' + src + '"><\/script>');
})();
</script>
```
