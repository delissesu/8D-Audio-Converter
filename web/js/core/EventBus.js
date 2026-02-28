// web/js/core/EventBus.js
// Pub/sub event bus — singleton shared across all components.
// Decouples components from each other.

export class EventBus {
  static #instance = null;
  #listeners       = new Map();   // event → Set of callbacks

  static getInstance() {
    if (!EventBus.#instance) EventBus.#instance = new EventBus();
    return EventBus.#instance;
  }

  /** Register a callback for an event */
  on(event, callback) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(callback);
  }

  /** Remove a specific callback */
  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }

  /** Fire an event with optional data payload */
  emit(event, data = null) {
    this.#listeners.get(event)?.forEach((cb) => cb(data));
  }

  /** Remove all listeners for all events (useful in tests) */
  clear() { this.#listeners.clear(); }
}
