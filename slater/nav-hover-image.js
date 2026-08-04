/*
  Nav Hover Image — standalone build for Slater.

  Paste into Slater's JS. No imports, no build step, no dependencies.
  This file is deliberately NOT part of the Vite bundle (nothing in src/ imports
  it), so it can be copied verbatim.

  Markup contract:
    nav-link-id="about"     a nav link/item — hovering it reveals the image
    nav-image-id="about"    the image (or its wrapper) with the same id
    nav-image-default       optional flag on one image: overrides which one
                            shows before the first hover (default: the first
                            nav-image-id in DOM order)
    data-nav-hover="wrap"   optional, on a container: scopes a group of images
                            and links to it. Needed when a page has more than
                            one image stack (e.g. two mega dropdowns), so each
                            gets its own fallback image and its own last-hovered
                            image. Each wrap is fully independent.

  Behavior: the first image in each scope is showing from the start, so the nav
  is never empty when it opens. Hovering a link swaps to its image, and that
  image then stays — moving off the link does not clear it, so closing and
  reopening the nav shows whatever was hovered last.

  Showing the fallback image does NOT depend on links being found. A scope with
  images but no matching links still shows its first image; it just won't respond
  to hover.

  The images are absolutely stacked on top of each other in the Designer. This
  script never positions them and never sets a transition — it only toggles the
  class `is-nav-image-active`, which flips opacity between 0 and 1. All timing
  and easing stay in your own CSS on the images, so a `transition: opacity 200ms
  <ease>` there is what controls the cross-fade.

  Both the bare and `data-` prefixed attribute forms work. Ids are trimmed and
  matched case-insensitively.

  To check whether this script took over, with no logging:
    document.documentElement.hasAttribute('data-nav-hover-on')
*/
;(() => {
  'use strict'

  const WRAP_SELECTOR = '[data-nav-hover="wrap"]'
  const LINK_SELECTOR = '[nav-link-id], [data-nav-link-id]'
  const IMAGE_SELECTOR = '[nav-image-id], [data-nav-image-id]'
  const ACTIVE = 'is-nav-image-active'
  const STYLE_ID = 'nav-hover-image-styles'
  // How long to keep watching for markup that renders after this runs.
  const RETRY_WINDOW = 10000

  /*
    Property pages don't run the nav hover at all. Matched as a path prefix, so
    one pattern covers every shape a property URL takes on this site:
    /properties/<slug> (the static folder), /properties-cms/<slug> (the CMS
    collection), /property-types/<slug>, and a bare /property or /properties
    index. Anything not under a "propert…" first segment is unaffected.
  */
  const SKIP_PATH = /^\/propert(y|ies)/i

  // Bailing here — before injectStyles() and before the MutationObserver — is
  // what makes this a true no-op rather than a disabled script: the
  // html[data-nav-hover-on] rules are never added, so the images keep whatever
  // the site's own CSS gives them and nothing is left pinned by an !important
  // rule with no script to undo it.
  if (SKIP_PATH.test(location.pathname)) return

  /*
    State only — no transition, no duration, no easing. Your CSS on the images
    owns the cross-fade.

    `!important` on opacity so this script is the single authority on which image
    shows, and can't be outranked by a more specific rule elsewhere. It does not
    affect the cross-fade: !important changes cascade priority, not transitions,
    so your `transition: opacity 200ms` still runs it.

    `visibility: inherit !important` neutralizes any per-item visibility rule on
    the images — the kind that hides them all and un-hides only the hovered one.
    Left in place, such a rule silently defeats everything here: opacity:1 on the
    fallback image means nothing while visibility keeps it hidden, which is
    exactly the "hover works but the default image never appears" symptom.

    `inherit` rather than `visible` on purpose. The images live inside a dropdown
    whose closed state is visibility:hidden, and inheriting means they follow that
    open/closed state as they should, instead of being forced visible and leaking
    out of a closed dropdown. It still overrides an explicit per-item rule,
    because !important beats it while the value stays inheritance.

    Because visibility is now constant rather than toggled per state, opacity
    alone drives the cross-fade — no visibility snap at either end of the fade.

    Everything is gated on `html[data-nav-hover-on]`, set only once images have
    actually been found and painted. That keeps this fail-safe — if the hooks are
    never found, none of these rules apply and the markup behaves exactly as it
    would without the script, rather than being pinned invisible by an
    !important rule that nothing is left to undo.

    The `:not([data-nav-hover-ready])` rule suppresses transitions until the
    first state has painted — otherwise applying opacity:0 would animate through
    *your* transition and flash the whole stack on load.

    Note this sets opacity but not visibility: a visibility flip can't be
    transitioned, so it would snap at one end of the fade and read as a jerk.
    Inactive images are hidden from assistive tech with aria-hidden instead.
  */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      html[data-nav-hover-on] [nav-image-id],
      html[data-nav-hover-on] [data-nav-image-id] {
        opacity: 0 !important;
        visibility: inherit !important;
        pointer-events: none;
      }
      html[data-nav-hover-on] [nav-image-id].${ACTIVE},
      html[data-nav-hover-on] [data-nav-image-id].${ACTIVE} {
        opacity: 1 !important;
      }
      html[data-nav-hover-on]:not([data-nav-hover-ready]) [nav-image-id],
      html[data-nav-hover-on]:not([data-nav-hover-ready]) [data-nav-image-id] {
        transition: none !important;
      }
    `
    document.head.append(style)
  }

  const readHook = (el, name) =>
    el.getAttribute(name) ?? el.getAttribute(`data-${name}`)
  const readId = (el, name) => (readHook(el, name) || '').trim().toLowerCase()

  // One scope (a wrap, or the whole document when there are no wraps). Holds its
  // own images and its own last-hovered id, so scopes never affect each other.
  const scopes = new Map()
  const wiredLinks = new WeakSet()
  let engaged = false

  function engage() {
    if (engaged) return
    engaged = true
    document.documentElement.setAttribute('data-nav-hover-on', '')
    // Hand transitions back to your CSS only after the first state has painted,
    // so the initial hide is instant rather than an animated fade-out.
    requestAnimationFrame(() =>
      document.documentElement.setAttribute('data-nav-hover-ready', '')
    )
  }

  function paint(scope) {
    const { images, initial, activeId } = scope
    images.forEach((image) => {
      const on = activeId === null ? image === initial : image.id === activeId
      image.el.classList.toggle(ACTIVE, on)
      // Stands in for visibility:hidden, which can't be transitioned.
      if (on) image.el.removeAttribute('aria-hidden')
      else image.el.setAttribute('aria-hidden', 'true')
    })
    scope.links.forEach((link) =>
      link.el.classList.toggle(
        'is-active',
        link.id === activeId && activeId !== null
      )
    )
  }

  // Idempotent: safe to call repeatedly as markup appears. Picks up newly
  // rendered images and links without disturbing the current selection.
  // `only` narrows which image elements this scope owns, used for the document
  // scope so it doesn't claim images that belong to a wrap.
  function sync(root, only) {
    const found = only || [...root.querySelectorAll(IMAGE_SELECTOR)]
    const images = found.map((el) => ({
      el,
      id: readId(el, 'nav-image-id'),
      isDefault: readHook(el, 'nav-image-default') !== null,
    }))
    if (images.length === 0) return false

    let scope = scopes.get(root)
    if (!scope) {
      scope = { images: [], links: [], initial: null, activeId: null }
      scopes.set(root, scope)
    }
    scope.images = images
    scope.links = [...root.querySelectorAll(LINK_SELECTOR)].map((el) => ({
      el,
      id: readId(el, 'nav-link-id'),
    }))

    // The fallback: the image flagged nav-image-default, else the first in DOM
    // order. Deliberately computed and painted whether or not any link pairs up
    // — an unpaired scope should still show an image rather than nothing.
    scope.initial =
      scope.images.find((image) => image.isDefault) || scope.images[0]
    paint(scope)

    const imageIds = new Set(images.map((i) => i.id).filter(Boolean))
    scope.links.forEach(({ el, id }) => {
      if (!imageIds.has(id) || wiredLinks.has(el)) return
      wiredLinks.add(el)
      const activate = () => {
        if (scope.activeId === id) return
        scope.activeId = id
        paint(scope)
      }
      // Only enter/focusin: the image persists after the pointer leaves, so
      // there is no leave handler and nothing to defer to avoid a flicker
      // between adjacent links.
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') activate()
      })
      // focusin rather than focus: it bubbles, so the hook works whether it sits
      // on the <a> itself or on a wrapper around it.
      el.addEventListener('focusin', activate)
    })

    return true
  }

  function scan() {
    // Only a wrap that actually contains images can act as a scope. A wrap put
    // on a links-only container would otherwise capture the page and leave the
    // real images unscanned — invisible to this script and never painted.
    const wraps = [...document.querySelectorAll(WRAP_SELECTOR)].filter((wrap) =>
      wrap.querySelector(IMAGE_SELECTOR)
    )

    // Each scope stands alone — one failing must never hold back the others,
    // which is why this isn't an all-or-nothing check across scopes.
    let found = false
    wraps.forEach((wrap) => {
      if (sync(wrap)) found = true
    })

    // Any images outside those wraps still need an owner, so they get a
    // document-level scope. This is also the whole-page path when no usable wrap
    // exists at all.
    const loose = [...document.querySelectorAll(IMAGE_SELECTOR)].filter(
      (image) => !wraps.some((wrap) => wrap.contains(image))
    )
    if (loose.length > 0 && sync(document, loose)) found = true

    if (found) engage()
  }

  injectStyles()

  // No DOMContentLoaded: Slater can run this after that event has already fired
  // (in which case a listener would never call back), and equally it can run
  // before Webflow has rendered the nav — CMS collection lists especially. So
  // scan immediately, then keep scanning as the DOM changes for a bounded
  // window. sync() is idempotent, so re-scanning is free of side effects.
  scan()

  let queued = false
  const observer = new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      scan()
    })
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  setTimeout(() => observer.disconnect(), RETRY_WINDOW)
})()
