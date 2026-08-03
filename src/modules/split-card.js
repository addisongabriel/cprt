import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

/*
  Split Card — scroll-driven crossfade through the images stacked inside the
  Split Card Section component. Authoring guide: docs/split-card-webflow.md

  Markup contract (hook attributes live on the component definition; the
  `sse-*` forms are what is already wired on the site, the `data-split-card`
  forms and the class names are accepted as equivalents):
    [sse-component="split-card"] / [data-split-card="section"] / .split-card_section
        the tall section — the scroll distance for the whole sequence
    [sse-part="wrap"] / [data-split-card="wrap"] / .split-card_wrap
        the sticky viewport-height frame inside it
    [sse-part="feature"] / [data-split-card="feature"] / .split-card_feature
        the stack; its direct .u-image-wrapper children are the slides

  Each image sits in its own .u-image-wrapper (the Visual Image component
  root), and the wrappers — not the images — are the sibling set. The Designer
  stacks them absolutely, so later siblings already paint over earlier ones;
  this module only drives opacity, never position.

  The section's height comes from --image-count in src/styles/split-card.css,
  which counts wrappers with :has() so the section is the right height before
  JS runs. The module re-sets --image-count from the real count once it has
  the elements, which also covers stacks larger than the CSS chain goes.

  Config attributes (all optional, on the section — the unprefixed forms from
  the original spec are accepted too, e.g. data-hold for data-split-card-hold):
    data-split-card-hold      portion of each segment the image holds still
                              before it starts crossfading          (default 0.35)
    data-split-card-scrub     seconds of catch-up smoothing;
                              0 hard-links the timeline to scroll   (default 1)
    data-split-card-ease      GSAP ease name                        (default none)
    data-split-card-crossfade "true" also fades the outgoing wrapper out,
                              for stacks whose images don't fully cover
                              each other                            (default false)
    data-split-card-pin-wrap  "true" lets GSAP pin the wrap instead of the
                              CSS position:sticky                   (default false)
    data-split-card-markers   "true" draws ScrollTrigger's debug markers
*/

gsap.registerPlugin(ScrollTrigger)

const DEFAULTS = {
  hold: 0.35,
  scrub: 1,
  ease: 'none',
  crossfade: false,
  pinWrap: false,
  markers: false,
}

const SECTION_SELECTOR =
  '[sse-component="split-card"], [data-split-card="section"], .split-card_section'
const WRAP_SELECTOR = '[sse-part="wrap"], [data-split-card="wrap"], .split-card_wrap'
const FEATURE_SELECTOR =
  '[sse-part="feature"], [data-split-card="feature"], .split-card_feature'
const ITEM_SELECTOR = '.u-image-wrapper'

function readConfig(section) {
  // Accepts data-split-card-hold and the shorter data-hold, so either naming
  // set in the Designer works.
  const attr = (name) =>
    section.getAttribute(`data-split-card-${name}`) ?? section.getAttribute(`data-${name}`)
  const num = (name, fallback) => {
    const value = parseFloat(attr(name))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    // A hold of 1 would leave a zero-length crossfade, so keep some fade.
    hold: Math.min(Math.max(num('hold', DEFAULTS.hold), 0), 0.9),
    scrub: Math.max(num('scrub', DEFAULTS.scrub), 0),
    ease: attr('ease') || DEFAULTS.ease,
    crossfade: attr('crossfade') === 'true',
    pinWrap: attr('pin-wrap') === 'true',
    markers: attr('markers') === 'true',
  }
}

// The slides are the feature's direct .u-image-wrapper children. If the
// Visual Image root class is ever renamed, fall back to any direct child that
// holds an image, so the sequence degrades to "still works" rather than "does
// nothing".
function readItems(feature) {
  const wrappers = [...feature.querySelectorAll(`:scope > ${ITEM_SELECTOR}`)]
  if (wrappers.length > 0) return wrappers
  return [...feature.children].filter((child) => child.querySelector('img'))
}

function initInstance(section) {
  if (section.hasAttribute('data-split-card-initialized')) return

  const feature = section.querySelector(FEATURE_SELECTOR)
  if (!feature) {
    console.warn('[split-card] no feature element found in', section)
    return
  }

  const items = readItems(feature)
  // One image is a static card, not a sequence — leave it alone entirely.
  if (items.length < 2) return
  section.setAttribute('data-split-card-initialized', '')

  // Authoritative count for the section height, replacing the :has() estimate.
  section.style.setProperty('--image-count', items.length)

  const config = readConfig(section)

  // Later siblings paint over earlier ones, so the sequence only ever needs to
  // fade the next image in — the stack below it stays covered.
  gsap.set(items, { opacity: 0 })
  gsap.set(items[0], { opacity: 1 })

  // Reduced motion keeps the first image and skips the scroll sequence. The
  // section is still tall, which reads as a long static card.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const wrap = section.querySelector(WRAP_SELECTOR)
  if (config.pinWrap && wrap) {
    // Sticky and GSAP's pin fight over the same element — hand it to GSAP.
    wrap.style.position = 'relative'
  }

  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      // scrub: true hard-links to scroll; a number adds that many seconds of
      // catch-up smoothing.
      scrub: config.scrub > 0 ? config.scrub : true,
      pin: config.pinWrap && wrap ? wrap : false,
      pinSpacing: false,
      invalidateOnRefresh: true,
      markers: config.markers,
    },
  })

  // One timeline unit per transition, which the section height maps to one
  // viewport of scroll: hold, then fade the next image in over the rest.
  items.forEach((item, index) => {
    if (index === 0) return
    const start = index - 1 + config.hold
    const duration = 1 - config.hold
    timeline.to(item, { opacity: 1, ease: config.ease, duration }, start)
    if (config.crossfade) {
      // Fading the outgoing image out as well, for stacks where an image
      // doesn't fully cover the one beneath it. Costs a slight dip to the
      // background mid-transition.
      timeline.to(items[index - 1], { opacity: 0, ease: config.ease, duration }, start)
    }
  })

  // Images that decode after init change the section's height, which moves
  // every start/end this trigger measured.
  items.forEach((item) => {
    const image = item.querySelector('img')
    if (image && !image.complete) {
      image.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
    }
  })
}

export function init() {
  document.querySelectorAll(SECTION_SELECTOR).forEach(initInstance)
}
