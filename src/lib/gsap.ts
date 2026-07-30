/**
 * GSAP accessor
 *
 * GSAP is loaded by Webflow, not bundled (see the `external` list in build.js),
 * so it is read off the window rather than imported. Two copies on one page
 * would register plugins against the wrong instance.
 */

declare global {
  interface Window {
    gsap?: any;
    ScrollTrigger?: any;
    Flip?: any;
    SplitText?: any;
  }
}

/**
 * Returns GSAP, or null with a clear console warning if it (or a required
 * plugin) is not enabled on the Webflow side.
 *
 * Returning null rather than throwing is deliberate: a missing plugin should
 * disable one animation, not take down every other script on the page.
 */
export function getGsap(required: string[] = []): any | null {
  if (!window.gsap) {
    console.warn('[engine] GSAP not found. Enable it in Webflow site settings.');
    return null;
  }
  for (const plugin of required) {
    if (!(window as any)[plugin]) {
      console.warn(`[engine] GSAP plugin "${plugin}" not found. Enable it in Webflow.`);
      return null;
    }
  }
  return window.gsap;
}

export {};
