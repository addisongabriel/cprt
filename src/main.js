import './styles/main.css'

import * as hoverTab from './modules/hover-tab.js'
import * as mapEmbed from './modules/map-embed.js'
import * as navHoverImage from './modules/nav-hover-image.js'

// Register page modules here. Each module lives in src/modules/ and exports
// an init() that guards on its own selector, so every page can safely load
// the same bundle.
const modules = [hoverTab, mapEmbed, navHoverImage]

function init() {
  modules.forEach((mod) => mod.init())
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
