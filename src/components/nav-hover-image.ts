/**
 * Component | Nav Hover Image
 *
 * Hovering a nav link swaps in its paired image inside the mega dropdown.
 * Authoring guide: docs/nav-hover-image-webflow.md
 *
 * Webflow markup contract:
 *   sse-component="nav-hover-image"  the dropdown wrap that holds both the
 *                                    links and the image stack — each one is an
 *                                    independent instance with its own fallback
 *                                    and its own last-hovered image
 *   nav-link-id="x"                  a nav link (or the wrapper around it)
 *   nav-image-id="x"                 the image revealed for the link with the
 *                                    same id — ids are arbitrary strings and
 *                                    only have to match between the pair
 *   nav-image-default                optional, on one image: overrides which one
 *                                    shows before the first hover (default: the
 *                                    first nav-image-id in DOM order)
 *
 * Both the bare and `data-` prefixed attribute forms are accepted, since
 * Webflow allows either. Ids are trimmed and matched case-insensitively.
 *
 * Behavior: the fallback image shows from the start, so the dropdown is never
 * empty when it opens. Hovering a link swaps to its image, and that image then
 * stays — moving off the link does not clear it, so reopening the dropdown
 * shows whatever was hovered last.
 *
 * This component sets no timing. It only toggles `is-nav-image-active`, and the
 * cross-fade comes from the site's own `transition: opacity` on the images, so
 * changing the duration is a Designer edit rather than a code change. The
 * stylesheet rules it depends on are gated behind the `data-nav-hover-on`
 * marker set below, which keeps it fail-safe: an instance that never finds its
 * hooks changes nothing at all rather than pinning images invisible.
 */

import { ComponentBase, component } from '@sygnal/sse-core';
import { readConfig } from '../lib/config';

const CONFIG = {
  /**
   * How long to keep watching for markup that renders after load, in ms.
   * The images and links come from CMS collection lists, so they can appear a
   * frame or two late. 0 disables the watch.
   */
  retryWindow: 4000,
};

const ATTR_PREFIX = 'nav-hover';

const LINK_SELECTOR = '[nav-link-id], [data-nav-link-id]';
const IMAGE_SELECTOR = '[nav-image-id], [data-nav-image-id]';
const ACTIVE_IMAGE_CLASS = 'is-nav-image-active';
const ACTIVE_LINK_CLASS = 'is-active';

interface Hook {
  el: HTMLElement;
  id: string;
}

/** Reads a hook attribute in either the bare or `data-` prefixed form. */
function readHook(el: HTMLElement, name: string): string | null {
  return el.getAttribute(name) ?? el.getAttribute(`data-${name}`);
}

function readId(el: HTMLElement, name: string): string {
  return (readHook(el, name) || '').trim().toLowerCase();
}

@component('nav-hover-image')
export class NavHoverImage extends ComponentBase {
  private cfg = CONFIG;

  private images: Hook[] = [];
  private links: Hook[] = [];
  private fallback: Hook | null = null;
  private activeId: string | null = null;

  private wired = new WeakSet<HTMLElement>();
  private engaged = false;

  protected onPrepare(): void {
    this.cfg = readConfig(this.element, CONFIG, ATTR_PREFIX);
  }

  protected async onLoad(): Promise<void> {
    if (!this.sync()) {
      console.warn(
        '[engine] nav-hover-image: no elements matching ' +
          `"${IMAGE_SELECTOR}" in this instance — check the hook attributes ` +
          'are on the published markup.',
        this.element
      );
    }
    this.watchForLateMarkup();
  }

  /**
   * Idempotent: safe to call repeatedly as markup appears. Picks up newly
   * rendered images and links without disturbing the current selection.
   * Returns whether this instance has any images to work with.
   */
  private sync(): boolean {
    const images = Array.from(this.element.querySelectorAll<HTMLElement>(IMAGE_SELECTOR));
    if (images.length === 0) return false;

    this.images = images.map((el) => ({ el, id: readId(el, 'nav-image-id') }));
    this.links = Array.from(this.element.querySelectorAll<HTMLElement>(LINK_SELECTOR)).map(
      (el) => ({ el, id: readId(el, 'nav-link-id') })
    );

    // The fallback is computed and painted whether or not any link pairs up —
    // an unpaired dropdown should still show an image rather than nothing.
    this.fallback =
      this.images.find((image) => readHook(image.el, 'nav-image-default') !== null) ||
      this.images[0];

    this.paint();
    this.engage();
    this.bindLinks();
    return true;
  }

  private bindLinks(): void {
    const imageIds = new Set(this.images.map((image) => image.id).filter(Boolean));
    this.links.forEach(({ el, id }) => {
      if (!imageIds.has(id) || this.wired.has(el)) return;
      this.wired.add(el);

      const activate = () => {
        if (this.activeId === id) return;
        this.activeId = id;
        this.paint();
      };

      // Only enter/focusin: the image persists after the pointer leaves, so
      // there is no leave handler and nothing to defer against a flicker
      // between adjacent links.
      el.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') activate();
      });
      // focusin rather than focus: it bubbles, so the hook works whether it
      // sits on the <a> itself or on a wrapper around it.
      el.addEventListener('focusin', activate);
    });
  }

  private paint(): void {
    this.images.forEach((image) => {
      const on = this.activeId === null ? image === this.fallback : image.id === this.activeId;
      image.el.classList.toggle(ACTIVE_IMAGE_CLASS, on);
      // Stands in for visibility:hidden, which can't be transitioned.
      if (on) image.el.removeAttribute('aria-hidden');
      else image.el.setAttribute('aria-hidden', 'true');
    });

    this.links.forEach((link) =>
      link.el.classList.toggle(
        ACTIVE_LINK_CLASS,
        link.id === this.activeId && this.activeId !== null
      )
    );
  }

  /**
   * Turns the stylesheet's opacity rules on for this instance, then hands
   * transitions back to the site's CSS a frame later — so applying the initial
   * state is instant rather than an animated fade of the whole stack.
   */
  private engage(): void {
    if (this.engaged) return;
    this.engaged = true;
    this.element.setAttribute('data-nav-hover-on', '');
    requestAnimationFrame(() => this.element.setAttribute('data-nav-hover-ready', ''));
  }

  /**
   * The dropdown's contents come from CMS collection lists, which can render
   * after this component initializes. Re-scanning is free of side effects, so
   * watch for a bounded window and pick them up if they appear.
   */
  private watchForLateMarkup(): void {
    if (this.cfg.retryWindow <= 0) return;

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        this.sync();
      });
    });
    observer.observe(this.element, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), this.cfg.retryWindow);
  }
}
