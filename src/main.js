import './styles/main.css'

import * as featuredTabs from './modules/featured-tabs.js'

// Register page modules here. Each module lives in src/modules/ and exports
// an init() that guards on its own selector, so every page can safely load
// the same bundle.
const modules = [featuredTabs]

function init() {
  modules.forEach((mod) => mod.init())
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
