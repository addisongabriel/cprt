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
    data-tabs-ease            GSAP ease name                          (default power2.inOut)
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
*/

const DEFAULTS = {
  interval: 5,
  duration: 0.6,
  resumeDelay: 3,
  shift: 2,
  ease: 'power2.inOut',
}

function readConfig(wrap) {
  const num = (name, fallback) => {
    const value = parseFloat(wrap.getAttribute(name))
    return Number.isFinite(value) ? value : fallback
  }
  return {
    interval: num('data-tabs-interval', DEFAULTS.interval),
    duration: num('data-tabs-duration', DEFAULTS.duration),
    resumeDelay: num('data-tabs-resume-delay', DEFAULTS.resumeDelay),
    shift: num('data-tabs-shift', DEFAULTS.shift),
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

  const config = readConfig(wrap)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const shiftPx = () =>
    config.shift * parseFloat(getComputedStyle(document.documentElement).fontSize)

  let current = 0
  let hovered = false
  let inView = false
  let timer = null

  items.forEach((item, index) => {
    item.classList.toggle('is-active', index === current)
    gsap.set(panes[index], { autoAlpha: index === current ? 1 : 0 })
    panes[index].style.pointerEvents = index === current ? 'auto' : 'none'
  })

  // Sliding active-tab highlight: one div that glides between triggers.
  // Adopt an authored .hover-tab_active inside the wrap if present, so it can
  // be styled in the Designer; otherwise create it.
  let highlight = null
  if (config.highlight && triggers.every(Boolean)) {
    highlight = wrap.querySelector('.hover-tab_active')
    if (!highlight) {
      highlight = document.createElement('div')
      highlight.className = 'hover-tab_active'
      wrap.append(highlight)
    }
  }

  function moveHighlight(animate) {
    if (!highlight) return
    const wrapBox = wrap.getBoundingClientRect()
    const box = triggers[current].getBoundingClientRect()
    gsap.to(highlight, {
      x: box.left - wrapBox.left,
      y: box.top - wrapBox.top,
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
    current = next
    items.forEach((item, index) =>
      item.classList.toggle('is-active', index === current)
    )
    moveHighlight(true)

    gsap.killTweensOf([outgoing, incoming])
    const distance = direction * shiftPx()
    const duration = reducedMotion ? 0 : config.duration

    outgoing.style.pointerEvents = 'none'
    incoming.style.pointerEvents = 'auto'
    gsap.to(outgoing, { autoAlpha: 0, x: distance, duration, ease: config.ease })
    gsap.fromTo(
      incoming,
      { autoAlpha: 0, x: -distance },
      { autoAlpha: 1, x: 0, duration, ease: config.ease }
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
