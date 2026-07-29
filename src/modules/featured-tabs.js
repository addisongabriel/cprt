import gsap from 'gsap'

/*
  Featured Tabs — GSAP-powered auto-advancing tab component.
  Webflow structure and authoring guide: docs/featured-tabs-webflow.md

  Markup contract (roles, one attribute):
    [data-featured-tabs="wrap"]   component root; carries the config attributes
    [data-featured-tabs="menu"]   empty container — one tab button is generated
                                  per pane, labelled from the pane's label element
    [data-featured-tabs="pane"]   one per tab, stacked in the pane area
    [data-featured-tabs="label"]  visually-hidden text inside each pane that
                                  names its tab button

  Config attributes (all optional, on the wrap):
    data-tabs-interval      seconds between auto-advances            (default 5)
    data-tabs-duration      seconds per pane transition              (default 0.6)
    data-tabs-resume-delay  extra seconds the loop stays paused
                            after the pointer leaves the component   (default 3)
    data-tabs-shift         rem the panes travel while crossfading   (default 2)
    data-tabs-ease          GSAP ease name                           (default power2.inOut)
    data-tabs-autoplay      "false" disables the auto-advance loop
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
  }
}

function initInstance(wrap) {
  if (wrap.hasAttribute('data-tabs-initialized')) return
  wrap.setAttribute('data-tabs-initialized', '')

  const menu = wrap.querySelector('[data-featured-tabs="menu"]')
  const panes = [...wrap.querySelectorAll('[data-featured-tabs="pane"]')]
  if (!menu || panes.length === 0) return

  const config = readConfig(wrap)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const shiftPx = () =>
    config.shift * parseFloat(getComputedStyle(document.documentElement).fontSize)

  let current = 0
  let hovered = false
  let inView = false
  let timer = null

  menu.setAttribute('role', 'tablist')
  const buttons = panes.map((pane, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'featured-tabs_button'
    button.setAttribute('role', 'tab')
    const label = pane.querySelector('[data-featured-tabs="label"]')
    button.textContent = label?.textContent.trim() || `Tab ${index + 1}`
    button.addEventListener('click', () => {
      goTo(index)
      queueNext()
    })
    menu.append(button)
    return button
  })

  panes.forEach((pane, index) => {
    pane.setAttribute('role', 'tabpanel')
    gsap.set(pane, { autoAlpha: index === current ? 1 : 0 })
    pane.style.pointerEvents = index === current ? 'auto' : 'none'
  })
  syncButtons()

  function syncButtons() {
    buttons.forEach((button, index) => {
      button.classList.toggle('is-active', index === current)
      button.setAttribute('aria-selected', index === current ? 'true' : 'false')
    })
  }

  function goTo(next, forcedDirection) {
    next = (next + panes.length) % panes.length
    if (next === current) return

    // Advancing to a tab further right drifts everything rightward; further
    // left drifts leftward. The auto-advance always forces "forward" so the
    // last→first wraparound doesn't read as a jump back.
    const direction = forcedDirection ?? (next > current ? 1 : -1)
    const outgoing = panes[current]
    const incoming = panes[next]
    current = next
    syncButtons()

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
    if (!config.autoplay || reducedMotion || hovered || !inView || panes.length < 2) return
    timer = gsap.delayedCall(holdFor + config.interval, () => {
      goTo(current + 1, 1)
      queueNext()
    })
  }

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
  document.querySelectorAll('[data-featured-tabs="wrap"]').forEach(initInstance)
}
