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

  Behavior: the first image is showing from the start, so the nav is never empty
  when it opens. Hovering a link swaps to its image, and that image then stays —
  moving off the link does not clear it, so closing and reopening the nav shows
  whatever was hovered last.

  More than one image list on a page (e.g. two mega dropdowns) needs
  data-nav-hover="wrap" on each container. Without it the whole document is one
  group: a single image is the fallback for the page, and hovering in one
  dropdown clears the other's image. With it, each wrap is fully independent —
  its own fallback, its own last-hovered image.

  The images are absolutely stacked on top of each other in the Designer. This
  script never positions them and never sets a transition — it only toggles the
  class `is-nav-image-active`, which flips opacity between 0 and 1. All timing
  and easing stay in your own CSS on the images, so a `transition: opacity 200ms
  <ease>` there is what controls the cross-fade.

  Both the bare and `data-` prefixed attribute forms work. Ids are trimmed and
  matched case-insensitively.
*/
;(() => {
  'use strict'

  const WRAP_SELECTOR = '[data-nav-hover="wrap"]'
  const LINK_SELECTOR = '[nav-link-id], [data-nav-link-id]'
  const IMAGE_SELECTOR = '[nav-image-id], [data-nav-image-id]'
  const ACTIVE = 'is-nav-image-active'
  const STYLE_ID = 'nav-hover-image-styles'
  // How long to keep watching for the hooks before giving up.
  const RETRY_WINDOW = 10000

  /*
    State only — no transition, no duration, no easing. Your CSS on the images
    owns the cross-fade.

    Two deliberate choices here:

    `!important` on opacity, because this script has to be the single authority
    on which image is showing. A pre-existing hover rule on the images (a Lumos
    `data-trigger="hover"` opacity formula, say) will otherwise outrank a plain
    class selector and keep reverting the image the moment the pointer leaves —
    which looks exactly like this script not persisting the last hovered image.
    It does not affect the cross-fade: !important changes cascade priority, not
    transitions, so your `transition: opacity 200ms` still runs. If you do have
    such a rule on the images, better to delete it so only one system drives
    opacity.

    Everything is gated on `html[data-nav-hover-on]`, which is only set once an
    instance has actually wired up. That keeps this fail-safe: if the hooks are
    never found, none of these rules apply and the markup behaves exactly as it
    would without the script, rather than being pinned invisible by an
    !important rule that nothing is left to undo.

    The `:not([data-nav-hover-ready])` rule suppresses transitions until the
    initial state has painted — otherwise applying opacity:0 would animate
    through *your* transition and flash the whole stack on load.

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

  // Returns true once this root is wired (or was already), false if the hooks
  // aren't in the DOM yet and it's worth trying again.
  function initInstance(root) {
    const marker = root.nodeType === 1 ? root : document.documentElement
    if (marker.hasAttribute('data-nav-hover-initialized')) return true

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
    const pairedLinks = links.filter((l) => pairedIds.has(l.id))
    if (pairedLinks.length === 0) return false

    marker.setAttribute('data-nav-hover-initialized', '')

    // Shown before anything has been hovered, so the nav is never empty: the
    // image flagged nav-image-default, else the first one in DOM order.
    const initial = images.find((image) => image.isDefault) || images[0]

    // `null` means "nothing hovered yet" and is only ever the state before the
    // first hover — there is no going back to it, since the last hovered image
    // is meant to persist.
    const shouldShow = (image, id) =>
      id === null ? image === initial : image.id === id

    let activeId = null

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
      if (id === activeId) return
      activeId = id
      paint(id)
    }

    // Only enter/focusin: the image persists after the pointer leaves, so there
    // is no leave handler and no need to defer anything to avoid a flicker
    // between adjacent links.
    pairedLinks.forEach(({ el, id }) => {
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') activate(id)
      })
      // focusin rather than focus: it bubbles, so the hook works whether it sits
      // on the <a> itself or on a wrapper around it.
      el.addEventListener('focusin', () => activate(id))
    })

    return true
  }

  function attempt() {
    const wraps = document.querySelectorAll(WRAP_SELECTOR)
    const roots = wraps.length > 0 ? [...wraps] : [document]
    // every() so a page with several wraps keeps watching until all are wired.
    return roots.every((root) => initInstance(root))
  }

  // Turns the injected rules on, now that state classes are actually being
  // managed, then hands transitions back to your CSS one frame later — after the
  // initial state has painted, so the first hide is instant rather than a fade.
  //
  // Also the log-free way to check whether this script wired up:
  //   document.documentElement.hasAttribute('data-nav-hover-on')
  // false means no link/image id pair was found, and any hover effect you're
  // seeing is coming from your own CSS, not from here.
  function engage() {
    document.documentElement.setAttribute('data-nav-hover-on', '')
    requestAnimationFrame(() =>
      document.documentElement.setAttribute('data-nav-hover-ready', '')
    )
  }

  injectStyles()

  // No DOMContentLoaded: Slater can run this after that event has already fired
  // (in which case a listener would never call back), and equally it can run
  // before Webflow has rendered the nav — CMS collection lists especially. So
  // try immediately, then watch the DOM until the hooks turn up.
  if (attempt()) {
    engage()
  } else {
    const observer = new MutationObserver(() => {
      if (attempt()) {
        observer.disconnect()
        clearTimeout(timer)
        engage()
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    // Give up quietly: leaving the rules off means the markup keeps whatever
    // behavior it has without this script.
    const timer = setTimeout(() => observer.disconnect(), RETRY_WINDOW)
  }
})()
