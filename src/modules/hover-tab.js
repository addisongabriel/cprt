import gsap from 'gsap'

/*
  Hover Tab — GSAP auto-advancing tabs for the "Hover Tab Layout" /
  "Hover Tab Item" Webflow components. Authoring guide: docs/hover-tab-webflow.md

  Markup contract (hook attributes live on the component definitions):
    [data-hover-tab="wrap"]     Hover Tab Layout root; carries the config below
    [data-hover-tab="item"]     Hover Tab Item root — gets `is-active` while
                                current, so Designer styles can use the Lumos
                                state system for the active tab look
    [data-hover-tab="trigger"]  the tab button area inside an item
    [data-hover-tab="pane"]     the content layout inside an item

  Config attributes (all optional, on the wrap):
    data-tabs-interval        seconds between auto-advances           (default 5)
    data-tabs-duration        seconds per pane transition             (default 0.6)
    data-tabs-resume-delay    extra seconds the loop stays paused
                              after the pointer leaves the component  (default 3)
    data-tabs-shift           rem the panes travel while crossfading  (default 2)
    data-tabs-contents-shift  rem the pane's foreground travels
                              (default: half of data-tabs-shift)
    data-tabs-ease            GSAP ease name                          (default expo.out)
    data-tabs-autoplay        "false" disables the auto-advance loop
    data-tabs-hover-activate  "false" switches tabs on click only,
                              instead of activating on trigger hover
    data-tabs-highlight       "false" disables the sliding active highlight
    data-tabs-highlight-duration  seconds the highlight takes to glide
                                  between triggers               (default 0.4)

  The module also maintains a single div.hover-tab_active — a highlight that
  glides from trigger to trigger as the active tab changes. If the wrap
  already contains a .hover-tab_active element (authored in the Designer so it
  can be styled there), it is adopted; otherwise one is created.

  Parallax: the pane's background layers (.u-image-wrapper and the media
  overlay) ride the pane's own translate at the full `shift`, while the
  foreground (.hover-tab_contents) is counter-translated so its *net* travel is
  `contentsShift` — half the background by default. Moving the foreground by a
  counter-transform on top of the pane's, rather than driving each layer
  independently, is deliberate: it leaves .u-image-wrapper's `transform`
  untouched, so the CSS-only hover zoom in src/styles/hover-tab.css keeps
  working. An inline transform from GSAP would beat that stylesheet rule and
  silently kill the zoom.

  Consequence: .hover-tab_contents' transform is owned by this module — don't
  also transform it in the Designer.
*/

const DEFAULTS = {
  interval: 5,
  duration: 0.6,
  resumeDelay: 3,
  shift: 2,
  contentsRatio: 0.5,
  ease: 'expo.out',
}

function readConfig(wrap) {
  const num = (name, fallback) => {
    const value = parseFloat(wrap.getAttribute(name))
    return Number.isFinite(value) ? value : fallback
  }
  const shift = num('data-tabs-shift', DEFAULTS.shift)
  return {
    interval: num('data-tabs-interval', DEFAULTS.interval),
    duration: num('data-tabs-duration', DEFAULTS.duration),
    resumeDelay: num('data-tabs-resume-delay', DEFAULTS.resumeDelay),
    shift,
    // Foreground travel, in the same rem unit as `shift`. Half of it by
    // default, so the copy trails the background image.
    contentsShift: num('data-tabs-contents-shift', shift * DEFAULTS.contentsRatio),
    ease: wrap.getAttribute('data-tabs-ease') || DEFAULTS.ease,
    autoplay: wrap.getAttribute('data-tabs-autoplay') !== 'false',
    hoverActivate: wrap.getAttribute('data-tabs-hover-activate') !== 'false',
    highlight: wrap.getAttribute('data-tabs-highlight') !== 'false',
    highlightDuration: num('data-tabs-highlight-duration', 0.4),
  }
}

function initInstance(wrap) {
  if (wrap.hasAttribute('data-tabs-initialized')) return

  const items = [...wrap.querySelectorAll('[data-hover-tab="item"]')]
  const panes = items.map((item) => item.querySelector('[data-hover-tab="pane"]'))
  const triggers = items.map((item) =>
    item.querySelector('[data-hover-tab="trigger"]')
  )
  if (items.length === 0 || panes.includes(null)) return
  wrap.setAttribute('data-tabs-initialized', '')

  // Foreground layer of each pane, translated against the pane to slow it down.
  // Attribute first so the class can be renamed in the Designer; null where a
  // pane has no separate foreground, which just means no parallax for that one.
  const contents = panes.map((pane) =>
    pane.querySelector('[data-hover-tab="contents"], .hover-tab_contents')
  )

  const config = readConfig(wrap)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize)
  const shiftPx = () => config.shift * remPx()
  // How far the foreground must travel *against* the pane for its net movement
  // to be `contentsShift`. Negative while the foreground moves less than the
  // background, and 0 when the two are set equal (the pre-parallax behaviour).
  const counterPx = () => (config.contentsShift - config.shift) * remPx()

  let current = 0
  let hovered = false
  let inView = false
  let timer = null

  items.forEach((item, index) => {
    item.classList.toggle('is-active', index === current)
    gsap.set(panes[index], { autoAlpha: index === current ? 1 : 0 })
    if (contents[index]) gsap.set(contents[index], { x: 0 })
    panes[index].style.pointerEvents = index === current ? 'auto' : 'none'
  })

  // Sliding active-tab highlight: one div that glides between triggers. It
  // lives inside the items' container (hover-tab_slot) so it shares the
  // triggers' stacking context instead of fighting z-index from the wrap.
  // Adopt an authored .hover-tab_active if present, so it can be styled in
  // the Designer; otherwise create it.
  let highlight = null
  if (config.highlight && triggers.every(Boolean)) {
    highlight = wrap.querySelector('.hover-tab_active')
    if (!highlight) {
      highlight = document.createElement('div')
      highlight.className = 'hover-tab_active'
      items[0].parentElement.append(highlight)
    }
  }

  function moveHighlight(animate) {
    if (!highlight) return
    // Position against the highlight's actual containing block, so the math
    // holds whether the slot is positioned or falls through to the wrap.
    const originBox = (highlight.offsetParent || wrap).getBoundingClientRect()
    const box = triggers[current].getBoundingClientRect()
    gsap.to(highlight, {
      x: box.left - originBox.left,
      y: box.top - originBox.top,
      width: box.width,
      height: box.height,
      duration: animate && !reducedMotion ? config.highlightDuration : 0,
      ease: config.ease,
      overwrite: 'auto',
    })
  }

  moveHighlight(false)
  // Re-seat the highlight instantly whenever the layout shifts.
  new ResizeObserver(() => moveHighlight(false)).observe(wrap)

  function goTo(next, forcedDirection) {
    next = (next + items.length) % items.length
    if (next === current) return

    // Advancing to a tab further right drifts everything rightward; further
    // left drifts leftward. The auto-advance always forces "forward" so the
    // last→first wraparound doesn't read as a jump back.
    const direction = forcedDirection ?? (next > current ? 1 : -1)
    const outgoing = panes[current]
    const incoming = panes[next]
    const outgoingContents = contents[current]
    const incomingContents = contents[next]
    current = next
    items.forEach((item, index) =>
      item.classList.toggle('is-active', index === current)
    )
    moveHighlight(true)

    gsap.killTweensOf(
      [outgoing, incoming, outgoingContents, incomingContents].filter(Boolean)
    )
    const distance = direction * shiftPx()
    const counter = direction * counterPx()
    const duration = reducedMotion ? 0 : config.duration

    outgoing.style.pointerEvents = 'none'
    incoming.style.pointerEvents = 'auto'
    gsap.to(outgoing, { autoAlpha: 0, x: distance, duration, ease: config.ease })
    gsap.fromTo(
      incoming,
      { autoAlpha: 0, x: -distance },
      { autoAlpha: 1, x: 0, duration, ease: config.ease }
    )

    // Same duration and ease as the panes, so the two layers stay locked
    // together and only their travel distance differs.
    if (outgoingContents)
      gsap.to(outgoingContents, { x: counter, duration, ease: config.ease })
    if (incomingContents)
      gsap.fromTo(
        incomingContents,
        { x: -counter },
        { x: 0, duration, ease: config.ease }
      )
  }

  function stopTimer() {
    timer?.kill()
    timer = null
  }

  // Schedules the next auto-advance. `holdFor` adds a one-off pause (used when
  // the pointer leaves the component) before the regular cadence resumes.
  function queueNext(holdFor = 0) {
    stopTimer()
    if (!config.autoplay || reducedMotion || hovered || !inView || items.length < 2)
      return
    timer = gsap.delayedCall(holdFor + config.interval, () => {
      goTo(current + 1, 1)
      queueNext()
    })
  }

  triggers.forEach((trigger, index) => {
    if (!trigger) return
    trigger.addEventListener('click', () => goTo(index))
    if (config.hoverActivate) {
      trigger.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') goTo(index)
      })
    }
  })

  wrap.addEventListener('pointerenter', () => {
    hovered = true
    stopTimer()
  })
  wrap.addEventListener('pointerleave', () => {
    hovered = false
    queueNext(config.resumeDelay)
  })

  // Only run the loop while the component is on screen.
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    inView ? queueNext() : stopTimer()
  })
  observer.observe(wrap)
}

export function init() {
  document.querySelectorAll('[data-hover-tab="wrap"]').forEach(initInstance)
}
