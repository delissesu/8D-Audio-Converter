// web/js/core/Component.js
// Base class for all UI components.
// Provides: DOM mounting, state management, event communication.

import { EventBus } from "./EventBus.js";

export class Component {
  #container  = null;
  #state      = {};
  #mounted    = false;

  constructor(initialState = {}) {
    this.#state = { ...initialState };
    this.bus    = EventBus.getInstance();   // shared singleton
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Mount this component into a DOM container element.
   * Calls render() to produce initial HTML, then afterMount().
   * @param {HTMLElement} container
   */
  mount(container) {
    if (this.#mounted) return;
    this.#container = container;
    this.#container.innerHTML = this.render();
    this.#mounted = true;
    this.afterMount();
  }

  /**
   * Called once after first render. Attach event listeners here.
   * Override in subclasses.
   */
  afterMount() {}

  /**
   * Update component state and re-render if changed.
   * @param {Object} newState - Partial state to merge
   */
  update(newState) {
    const prev = { ...this.#state };
    this.#state = { ...this.#state, ...newState };
    if (JSON.stringify(prev) !== JSON.stringify(this.#state)) {
      this.#patch();
    }
  }

  /** Force re-render without state change. */
  refresh() { this.#patch(); }

  unmount() {
    if (this.#container) this.#container.innerHTML = "";
    this.#mounted  = false;
    this.#container = null;
  }

  // ── Subclass interface ───────────────────────────────────────────

  /**
   * Return HTML string for this component.
   * MUST be overridden in every subclass.
   * @returns {string}
   */
  render() {
    throw new Error(`${this.constructor.name} must implement render()`);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  get state()      { return { ...this.#state }; }
  get container()  { return this.#container; }
  get isMounted()  { return this.#mounted; }

  /** Shortcut: query inside this component's container */
  $(selector)      { return this.#container?.querySelector(selector); }
  $$(selector)     { return this.#container?.querySelectorAll(selector) ?? []; }

  /** Emit an event on the shared EventBus */
  emit(event, data) { this.bus.emit(event, data); }

  /** Listen to a shared EventBus event */
  on(event, handler) { this.bus.on(event, handler); }

  // ── Private ──────────────────────────────────────────────────────

  #patch() {
    if (!this.#container || !this.#mounted) return;
    // Simple full re-render (no virtual DOM diffing needed at this scale)
    const next = this.render();
    this.#container.innerHTML = next;
    this.afterMount();   // re-attach event listeners after re-render
  }
}
