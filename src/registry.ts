/**
 * Module Registry
 * Central location for ALL project modules:
 * - Pages & Components (SSE)
 * - Actions & Events (FIX)
 *
 * This file imports all modules to trigger their decorators (@page, @component, @action)
 * and provides a single source of truth for the application's module structure.
 *
 * A module that is not imported here never runs, and nothing reports an error —
 * so every new file needs a line below.
 *
 * https://engine.sygnal.com/
 */

import {
  RouteDispatcher,
  getAllPages,
  getRegistryStats,
  initializeComponents,
  // FIX imports from sse-core
  initializeFIX,
  FIXDebug,
  FIXRegistry,
} from "@sygnal/sse-core";
import { Site } from "./site";

// ============================================================
// PAGES - Import all pages to trigger @page decorator
// ============================================================
// Add page imports here as you create them. Pages are for choreography that is
// genuinely specific to one route; anything attached to an element is a
// component.

// ============================================================
// COMPONENTS - Import all components to trigger @component decorator
// ============================================================
import "./components/hover-tab";
import "./components/nav-hover-image";
// Add more component imports here as you create them

// ============================================================
// FIX - STANDARD TRIGGERS & ACTIONS (auto-loaded from sse-core)
// ============================================================
// Standard triggers and actions are automatically registered when
// @sygnal/sse-core is imported. No manual imports needed!
// - trigger:click (TriggerClick)
// - action:click (ActionClick)

// ============================================================
// ACTIONS - Custom project actions (FIX)
// ============================================================
// Import your custom actions here and register them
// Example:
// import { ActionCustom } from "./actions/custom-action";
// registerProgrammaticAction('custom-action', 'custom-event', ActionCustom);

/**
 * Create and configure route dispatcher
 */
export const routeDispatcher = (): RouteDispatcher => {
    const dispatcher = new RouteDispatcher(Site);

    // Auto-discovered routes from @page decorators
    dispatcher.routes = getAllPages();

    return dispatcher;
}

/**
 * Re-export SSE functions from sse-core for convenience
 */
export { initializeComponents, getRegistryStats };

/**
 * Re-export FIX functions and utilities
 */
export { initializeFIX, FIXDebug, FIXRegistry };

/**
 * Get FIX registry stats (mirrors getRegistryStats for SSE)
 */
export const getFIXRegistryStats = () => ({
    triggers: FIXRegistry.getTriggerNames().length,
    actions: FIXRegistry.getActionNames().length,
});
