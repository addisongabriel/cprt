/*
  Nav Hover Image — standalone build for Slater.

  Paste into Slater's JS. No imports, no build step, no dependencies.
  This file is deliberately NOT part of the Vite bundle (nothing in src/ imports
  it), so it can be copied verbatim.

  Markup contract:
    nav-link-id="about"     a nav link/item — hovering it reveals the image
    nav-image-id="about"    the image (or its wrapper) with the same id
    nav-image-default       optional flag on one image: what shows at rest

  The images are absolutely stacked on top of each other in the Designer. This
  script never positions them and never sets a transition — it only toggles the
  class `is-nav-image-active`, which flips opacity between 0 and 1. All timing
  and easing stay in your own CSS on the images, so a `transition: opacity 200ms
  <ease>` there is what controls the cross-fade.

  Both the bare and `data-` prefixed attribute forms work. Ids are trimmed and
  matched case-insensitively.

  Console logging is on (DEBUG below) so it's obvious whether this is firing.
  Turn it off once you're happy with it.
*/
;(() => {
  'use strict'

  const DEBUG = true
  const log = (...a) => DEBUG && console.log('[nav-hover]', ...a)
  const warn = (...a) => DEBUG && console.warn('[nav-hover]', ...a)

  const WRAP_SELECTOR = '[data-nav-hover="wrap"]'
  const LINK_SELECTOR = '[nav-link-id], [data-nav-link-id]'
  const IMAGE_SELECTOR = '[nav-image-id], [data-nav-image-id]'
  const ACTIVE = 'is-nav-image-active'
  const STYLE_ID = 'nav-hover-image-styles'
  // How long to keep watching for the hooks before giving up and reporting.
  const RETRY_WINDOW = 10000

  /*
    State only — no transition, no duration, no easing. Your CSS on the images
    owns the cross-fade.

    The one exception is the `html:not([data-nav-hover-ready])` rule: without it,
    applying opacity:0 on load would animate through *your* transition, flashing
    the whole stack and fading it out. That suppression is removed one frame
    later, after the rest state has painted, and from then on your CSS is fully
    in control.

    Note this sets opacity but not visibility: a visibility flip can't be
    transitioned, so it would snap at one end of the fade and read as a jerk.
    Inactive images are hidden from assistive tech with aria-hidden instead.
  */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      [nav-image-id], [data-nav-image-id] {
        opacity: 0;
        pointer-events: none;
      }
      [nav-image-id].${ACTIVE}, [data-nav-image-id].${ACTIVE} {
        opacity: 1;
      }
      html:not([data-nav-hover-ready]) [nav-image-id],
      html:not([data-nav-hover-ready]) [data-nav-image-id] {
        transition: none !important;
      }
    `
    document.head.append(style)
  }

  const readHook = (el, name) =>
    el.getAttribute(name) ?? el.getAttribute(`data-${name}`)
  const readId = (el, name) => (readHook(el, name) || '').trim().toLowerCase()

  // Returns true once this root is wired (or was already), false if the hooks
  // aren't in the DOM yet and it's worth trying again.
  function initInstance(root, verbose) {
    const marker = root.nodeType === 1 ? root : document.documentElement
    if (marker.hasAttribute('data-nav-hover-initialized')) {
      warn('already initialized — skipping. This script may be loading twice.')
      return true
    }

    const links = [...root.querySelectorAll(LINK_SELECTOR)].map((el) => ({
      el,
      id: readId(el, 'nav-link-id'),
    }))
    const images = [...root.querySelectorAll(IMAGE_SELECTOR)].map((el) => ({
      el,
      id: readId(el, 'nav-image-id'),
      isDefault: readHook(el, 'nav-image-default') !== null,
    }))

    const pairedIds = new Set(images.map((i) => i.id).filter(Boolean))
    const linkIds = new Set(links.map((l) => l.id).filter(Boolean))
    const pairedLinks = links.filter((l) => pairedIds.has(l.id))

    if (pairedLinks.length === 0) {
      // Quiet while still watching the DOM; report in full only on give-up.
      if (verbose) {
        log(`${links.length} link hook(s):`, links.map((l) => l.id || '(empty)'))
        log(`${images.length} image hook(s):`, images.map((i) => i.id || '(empty)'))
        if (links.length === 0 || images.length === 0) {
          warn(
            'nothing to wire up. Found no elements matching ' +
              `"${links.length === 0 ? LINK_SELECTOR : IMAGE_SELECTOR}". ` +
              'Check the attribute is on the markup and spelled exactly.'
          )
        } else {
          warn(
            'hooks found, but no link id matches an image id — every pair must ' +
              'share the same value. Links:',
            links.map((l) => l.id || '(empty)'),
            'Images:',
            images.map((i) => i.id || '(empty)')
          )
        }
      }
      return false
    }

    marker.setAttribute('data-nav-hover-initialized', '')
    log(`${links.length} link hook(s):`, links.map((l) => l.id || '(empty)'))
    log(`${images.length} image hook(s):`, images.map((i) => i.id || '(empty)'))

    // `null` is the rest state: only images flagged nav-image-default show.
    const shouldShow = (image, id) =>
      id === null ? image.isDefault : image.id === id

    let activeId = null
    let restFrame = null

    const paint = (id) => {
      images.forEach((image) => {
        const on = shouldShow(image, id)
        image.el.classList.toggle(ACTIVE, on)
        // Stands in for visibility:hidden, which can't be transitioned.
        if (on) image.el.removeAttribute('aria-hidden')
        else image.el.setAttribute('aria-hidden', 'true')
      })
      links.forEach((link) =>
        link.el.classList.toggle('is-active', link.id === id && id !== null)
      )
    }
    paint(null)

    function activate(id) {
      if (restFrame !== null) {
        cancelAnimationFrame(restFrame)
        restFrame = null
      }
      if (id === activeId) return
      activeId = id
      log(id === null ? 'back to rest' : `hover → ${id}`)
      paint(id)
    }

    // Returning to rest waits a frame, so sliding between two adjacent links
    // (leave then enter, dispatched together) switches images without a blink
    // through the rest state.
    function scheduleRest() {
      if (restFrame !== null) return
      restFrame = requestAnimationFrame(() => {
        restFrame = null
        activate(null)
      })
    }

    pairedLinks.forEach(({ el, id }) => {
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') activate(id)
      })
      el.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse') scheduleRest()
      })
      // focusin/focusout rather than focus/blur: they bubble, so the hook works
      // whether it sits on the <a> itself or on a wrapper around it.
      el.addEventListener('focusin', () => activate(id))
      el.addEventListener('focusout', () => scheduleRest())
    })

    log(`wired up ${pairedLinks.length} link(s):`, pairedLinks.map((l) => l.id))
    const unpairedLinks = links
      .filter((l) => !pairedIds.has(l.id))
      .map((l) => l.id || '(empty)')
    const unpairedImages = images
      .filter((i) => !linkIds.has(i.id))
      .map((i) => i.id || '(empty)')
    if (unpairedLinks.length) warn('links with no matching image:', unpairedLinks)
    if (unpairedImages.length) warn('images with no matching link:', unpairedImages)
    return true
  }

  function attempt(verbose) {
    const wraps = document.querySelectorAll(WRAP_SELECTOR)
    const roots = wraps.length > 0 ? [...wraps] : [document]
    // every() so a page with several wraps keeps watching until all are wired.
    return roots.every((root) => initInstance(root, verbose))
  }

  function markReady() {
    // Let the rest state paint before handing transitions back to your CSS,
    // so the initial hide is instant rather than an animated fade-out.
    requestAnimationFrame(() =>
      document.documentElement.setAttribute('data-nav-hover-ready', '')
    )
  }

  log('script loaded, scanning for hooks')
  injectStyles()

  // No DOMContentLoaded: Slater can run this after that event has already fired
  // (in which case a listener would never call back), and equally it can run
  // before Webflow has rendered the nav — CMS collection lists especially. So
  // try immediately, then watch the DOM until the hooks turn up.
  if (attempt(false)) {
    markReady()
  } else {
    log('hooks not in the DOM yet — watching for them')
    const observer = new MutationObserver(() => {
      if (attempt(false)) {
        observer.disconnect()
        clearTimeout(timer)
        markReady()
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    const timer = setTimeout(() => {
      observer.disconnect()
      // Final go, with the full diagnostics this time.
      attempt(true)
      markReady()
    }, RETRY_WINDOW)
  }
})()
