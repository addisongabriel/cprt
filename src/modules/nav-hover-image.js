import gsap from 'gsap'

/*
  Nav Hover Image — hovering a nav link cross-fades in its paired image.
  Authoring guide: docs/nav-hover-image-webflow.md

  Markup contract (ids pair a link to an image; any string works):
    nav-link-id="about"     a nav link/item — hovering it reveals the image
    nav-image-id="about"    the image (or its wrapper) with the same id
    nav-image-default       optional flag on one image: what shows at rest

  The images are absolutely stacked on top of each other in the Designer, so
  this module never positions them — it only drives opacity/visibility. Every
  image starts hidden (src/styles/nav-hover-image.css also hides them before JS
  runs, so the stack never flashes) and at most one is visible at a time.
  Pointing away from the links fades back to the rest state: the
  nav-image-default image if one is marked, otherwise nothing.

  Both the bare and `data-` prefixed attribute forms are accepted
  (`nav-link-id` or `data-nav-link-id`), since Webflow allows either. Ids are
  matched case-insensitively and trimmed.

  Config attributes (optional, on the wrap):
    data-nav-hover-duration   seconds per cross-fade   (default 0.4)
    data-nav-hover-ease       GSAP ease name           (default power2.out)

  Scoping: each [data-nav-hover="wrap"] on the page is an independent instance.
  With no wrap present the whole document is treated as one instance, which is
  all a site with a single nav needs.
*/

const DEFAULTS = {
  duration: 0.4,
  ease: 'power2.out',
}

const WRAP_SELECTOR = '[data-nav-hover="wrap"]'
const LINK_SELECTOR = '[nav-link-id], [data-nav-link-id]'
const IMAGE_SELECTOR = '[nav-image-id], [data-nav-image-id]'

// Reads a hook attribute in either the bare or `data-` prefixed form.
function readHook(el, name) {
  return el.getAttribute(name) ?? el.getAttribute(`data-${name}`)
}

function readId(el, name) {
  return (readHook(el, name) || '').trim().toLowerCase()
}

function readConfig(root) {
  const attr = (name) => (root.nodeType === 1 ? root.getAttribute(name) : null)
  const duration = parseFloat(attr('data-nav-hover-duration'))
  return {
    duration: Number.isFinite(duration) ? duration : DEFAULTS.duration,
    ease: attr('data-nav-hover-ease') || DEFAULTS.ease,
  }
}

function initInstance(root) {
  // The document fallback marks <html>, so a page can't be double-initialized.
  const marker = root.nodeType === 1 ? root : document.documentElement
  if (marker.hasAttribute('data-nav-hover-initialized')) return

  const links = [...root.querySelectorAll(LINK_SELECTOR)].map((el) => ({
    el,
    id: readId(el, 'nav-link-id'),
  }))
  const images = [...root.querySelectorAll(IMAGE_SELECTOR)].map((el) => ({
    el,
    id: readId(el, 'nav-image-id'),
    isDefault: readHook(el, 'nav-image-default') !== null,
  }))
  const pairedIds = new Set(images.map((image) => image.id).filter(Boolean))
  const pairedLinks = links.filter((link) => pairedIds.has(link.id))
  if (pairedLinks.length === 0) return
  marker.setAttribute('data-nav-hover-initialized', '')

  const config = readConfig(root)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // `null` is the rest state: only images flagged nav-image-default show.
  const shouldShow = (image, id) => (id === null ? image.isDefault : image.id === id)

  let activeId = null
  let restFrame = null

  images.forEach((image) =>
    gsap.set(image.el, { autoAlpha: shouldShow(image, null) ? 1 : 0 })
  )

  function activate(id) {
    if (restFrame !== null) {
      cancelAnimationFrame(restFrame)
      restFrame = null
    }
    if (id === activeId) return
    activeId = id

    const duration = reducedMotion ? 0 : config.duration
    images.forEach((image) => {
      gsap.to(image.el, {
        autoAlpha: shouldShow(image, id) ? 1 : 0,
        duration,
        ease: config.ease,
        overwrite: 'auto',
      })
    })
    links.forEach((link) =>
      link.el.classList.toggle('is-active', link.id === id && id !== null)
    )
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
    el.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') activate(id)
    })
    el.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') scheduleRest()
    })
    // focusin/focusout rather than focus/blur: they bubble, so the link works
    // whether the hook sits on the <a> itself or on a wrapper around it.
    el.addEventListener('focusin', () => activate(id))
    el.addEventListener('focusout', () => scheduleRest())
  })
}

export function init() {
  const wraps = document.querySelectorAll(WRAP_SELECTOR)
  if (wraps.length > 0) {
    wraps.forEach(initInstance)
  } else {
    initInstance(document)
  }
}
