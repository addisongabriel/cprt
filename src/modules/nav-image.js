/*
  Nav Hover Image — shows a nav preview image while its link is hovered.

  Markup contract (attributes set in the Designer):
    [nav-link-id="x"]   a nav link; hovering or keyboard-focusing it shows…
    [nav-image-id="x"]  …the image whose id matches. The images are absolutely
                        positioned on top of each other in the Designer.

  The companion CSS (src/styles/nav-image.css) hides every [nav-image-id] by
  default — so nothing flashes before JS runs — and fades one in while it has
  `is-active`. The module only toggles that class, so the visible state stays
  styleable in the Designer via the Lumos state system.
*/

export function init() {
  const links = document.querySelectorAll('[nav-link-id]')
  const images = document.querySelectorAll('[nav-image-id]')
  if (links.length === 0 || images.length === 0) return

  const imageById = new Map()
  images.forEach((image) => {
    imageById.set(image.getAttribute('nav-image-id'), image)
  })

  let active = null

  function show(id) {
    const image = imageById.get(id)
    if (image === active) return
    active?.classList.remove('is-active')
    image?.classList.add('is-active')
    active = image ?? null
  }

  function hide() {
    active?.classList.remove('is-active')
    active = null
  }

  links.forEach((link) => {
    const id = link.getAttribute('nav-link-id')
    link.addEventListener('pointerenter', () => show(id))
    link.addEventListener('pointerleave', hide)
    // Keyboard parity: focusing the link shows the same image.
    link.addEventListener('focusin', () => show(id))
    link.addEventListener('focusout', hide)
  })
}
