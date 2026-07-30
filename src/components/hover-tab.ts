/**
 * Component | Hover Tab
 *
 * Auto-advancing tabs for the "Hover Tab Layout" / "Hover Tab Item" components
 * on the CPRT site. Authoring guide: docs/hover-tab-webflow.md
 *
 * Webflow markup contract:
 *   sse-component="hover-tab"    Hover Tab Layout root (hover-tab_wrap)
 *   data-hover-tab="item"        Hover Tab Item root — gets `is-active` while
 *                                current, so the active look is authored in the
 *                                Designer with the Lumos state system
 *   data-hover-tab="trigger"     the tab button area inside an item
 *   data-hover-tab="pane"        the content layout inside an item
 *
 * `sse-part` equivalents are accepted for all three, so new markup can use the
 * engine convention without breaking the components already wired up.
 *
 * The module also maintains a single div.hover-tab_active — a highlight that
 * glides from trigger to trigger as the active tab changes. An authored
 * .hover-tab_active inside the wrap is adopted (so it can be styled in the
 * Designer); otherwise one is created.
 */

import { ComponentBase, component } from '@sygnal/sse-core';
import { getGsap } from '../lib/gsap';
import { readConfig } from '../lib/config';

const CONFIG = {
  /** Seconds between auto-advances. */
  interval: 5,
  /** Seconds per pane transition. */
  duration: 0.6,
  /** Extra seconds the loop stays paused after the pointer leaves. */
  resumeDelay: 3,
  /** Rem the panes travel while crossfading. */
  shift: 2,
  /** GSAP ease for the pane transition and the highlight. */
  ease: 'expo.out',
  /** false disables the auto-advance loop. */
  autoplay: true,
  /** false switches tabs on click only, instead of on trigger hover. */
  hoverActivate: true,
  /** false disables the sliding active highlight. */
  highlight: true,
  /** Seconds the highlight takes to glide between triggers. */
  highlightDuration: 0.4,
};

// Per-instance overrides keep the `data-tabs-*` names the site is authored
// against, e.g. data-tabs-resume-delay.
const ATTR_PREFIX = 'tabs';

const ITEM_SELECTOR = '[data-hover-tab="item"], [sse-part="item"]';
const TRIGGER_SELECTOR = '[data-hover-tab="trigger"], [sse-part="trigger"]';
const PANE_SELECTOR = '[data-hover-tab="pane"], [sse-part="pane"]';
const HIGHLIGHT_CLASS = 'hover-tab_active';

@component('hover-tab')
export class HoverTab extends ComponentBase {
  private gsap: any = null;
  private cfg = CONFIG;
  private reducedMotion = false;

  private items: HTMLElement[] = [];
  private panes: HTMLElement[] = [];
  private triggers: (HTMLElement | null)[] = [];
  private highlight: HTMLElement | null = null;

  private current = 0;
  private hovered = false;
  private inView = false;
  private timer: any = null;

  protected onPrepare(): void {
    this.cfg = readConfig(this.element, CONFIG, ATTR_PREFIX);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  protected async onLoad(): Promise<void> {
    this.gsap = getGsap();
    if (!this.gsap) return;

    this.items = Array.from(this.element.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    if (this.items.length === 0) {
      console.warn('[engine] hover-tab: no items found', this.element);
      return;
    }

    const panes = this.items.map((item) => item.querySelector<HTMLElement>(PANE_SELECTOR));
    if (panes.some((pane) => pane === null)) {
      console.warn('[engine] hover-tab: an item is missing its pane', this.element);
      return;
    }
    this.panes = panes as HTMLElement[];
    this.triggers = this.items.map((item) => item.querySelector<HTMLElement>(TRIGGER_SELECTOR));

    // Hands the stacked panes over to this component: the stylesheet hides all
    // but the first until this attribute appears, so they can't flash.
    this.element.setAttribute('data-hover-tab-ready', '');

    this.items.forEach((item, index) => {
      const active = index === this.current;
      item.classList.toggle('is-active', active);
      this.gsap.set(this.panes[index], { autoAlpha: active ? 1 : 0 });
      this.panes[index].style.pointerEvents = active ? 'auto' : 'none';
    });

    this.setupHighlight();
    this.bindEvents();
  }

  /**
   * The sliding highlight lives inside the items' container (hover-tab_slot) so
   * it shares the triggers' stacking context, instead of fighting z-index from
   * the wrap.
   */
  private setupHighlight(): void {
    if (!this.cfg.highlight || !this.triggers.every(Boolean)) return;

    this.highlight = this.element.querySelector<HTMLElement>(`.${HIGHLIGHT_CLASS}`);
    if (!this.highlight) {
      this.highlight = document.createElement('div');
      this.highlight.className = HIGHLIGHT_CLASS;
      this.items[0].parentElement?.append(this.highlight);
    }

    this.moveHighlight(false);
    // Re-seat it instantly whenever the layout shifts.
    new ResizeObserver(() => this.moveHighlight(false)).observe(this.element);
  }

  private moveHighlight(animate: boolean): void {
    const trigger = this.triggers[this.current];
    if (!this.highlight || !trigger) return;

    // Positioned against the highlight's actual containing block, so the math
    // holds whether the slot is positioned or falls through to the wrap.
    const originBox = (this.highlight.offsetParent || this.element).getBoundingClientRect();
    const box = trigger.getBoundingClientRect();

    this.gsap.to(this.highlight, {
      x: box.left - originBox.left,
      y: box.top - originBox.top,
      width: box.width,
      height: box.height,
      duration: animate && !this.reducedMotion ? this.cfg.highlightDuration : 0,
      ease: this.cfg.ease,
      overwrite: 'auto',
    });
  }

  private bindEvents(): void {
    this.triggers.forEach((trigger, index) => {
      if (!trigger) return;
      trigger.addEventListener('click', () => this.goTo(index));
      if (this.cfg.hoverActivate) {
        trigger.addEventListener('pointerenter', (event) => {
          if (event.pointerType === 'mouse') this.goTo(index);
        });
      }
    });

    this.element.addEventListener('pointerenter', () => {
      this.hovered = true;
      this.stopTimer();
    });
    this.element.addEventListener('pointerleave', () => {
      this.hovered = false;
      this.queueNext(this.cfg.resumeDelay);
    });

    // Only run the loop while the component is on screen.
    new IntersectionObserver(([entry]) => {
      this.inView = entry.isIntersecting;
      if (this.inView) this.queueNext();
      else this.stopTimer();
    }).observe(this.element);
  }

  /**
   * Advancing to a tab further right drifts everything rightward, further left
   * drifts leftward. The auto-advance forces "forward" so the last→first
   * wraparound doesn't read as a jump back.
   */
  private goTo(next: number, forcedDirection?: number): void {
    next = (next + this.items.length) % this.items.length;
    if (next === this.current) return;

    const direction = forcedDirection ?? (next > this.current ? 1 : -1);
    const outgoing = this.panes[this.current];
    const incoming = this.panes[next];
    this.current = next;

    this.items.forEach((item, index) => item.classList.toggle('is-active', index === this.current));
    this.moveHighlight(true);

    this.gsap.killTweensOf([outgoing, incoming]);
    const distance = direction * this.shiftPx();
    const duration = this.reducedMotion ? 0 : this.cfg.duration;

    outgoing.style.pointerEvents = 'none';
    incoming.style.pointerEvents = 'auto';
    this.gsap.to(outgoing, { autoAlpha: 0, x: distance, duration, ease: this.cfg.ease });
    this.gsap.fromTo(
      incoming,
      { autoAlpha: 0, x: -distance },
      { autoAlpha: 1, x: 0, duration, ease: this.cfg.ease }
    );
  }

  private shiftPx(): number {
    return this.cfg.shift * parseFloat(getComputedStyle(document.documentElement).fontSize);
  }

  private stopTimer(): void {
    this.timer?.kill();
    this.timer = null;
  }

  /**
   * Schedules the next auto-advance. `holdFor` adds a one-off pause (used when
   * the pointer leaves the component) before the regular cadence resumes.
   */
  private queueNext(holdFor = 0): void {
    this.stopTimer();
    if (
      !this.cfg.autoplay ||
      this.reducedMotion ||
      this.hovered ||
      !this.inView ||
      this.items.length < 2
    ) {
      return;
    }
    this.timer = this.gsap.delayedCall(holdFor + this.cfg.interval, () => {
      this.goTo(this.current + 1, 1);
      this.queueNext();
    });
  }
}
