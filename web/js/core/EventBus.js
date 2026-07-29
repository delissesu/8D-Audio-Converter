
export class EventBus {
  static #instance = null;
  #listeners       = new Map();   // event → Set of callbacks

  static getInstance() {
    if (!EventBus.#instance) EventBus.#instance = new EventBus();
    return EventBus.#instance;
  }

  on(event, callback) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(callback);
  }

  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }

  emit(event, data = null) {
    this.#listeners.get(event)?.forEach((cb) => cb(data));
  }

  clear() { this.#listeners.clear(); }
}
