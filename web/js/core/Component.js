
import { EventBus } from "./EventBus.js";

export class Component {
  #container  = null;
  #state      = {};
  #mounted    = false;

  constructor(initialState = {}) {
    this.#state = { ...initialState };
    this.bus    = EventBus.getInstance();   // shared singleton
  }


  mount(container) {
    if (this.#mounted) return;
    this.#container = container;
    this.#container.innerHTML = this.render();
    this.#mounted = true;
    this.afterMount();
  }

  afterMount() {}

  update(newState) {
    const prev = { ...this.#state };
    this.#state = { ...this.#state, ...newState };
    if (JSON.stringify(prev) !== JSON.stringify(this.#state)) {
      this.#patch();
    }
  }

  refresh() { this.#patch(); }

  unmount() {
    if (this.#container) this.#container.innerHTML = "";
    this.#mounted  = false;
    this.#container = null;
  }


  render() {
    throw new Error(`${this.constructor.name} must implement render()`);
  }


  get state()      { return { ...this.#state }; }
  get container()  { return this.#container; }
  get isMounted()  { return this.#mounted; }

  $(selector)      { return this.#container?.querySelector(selector); }
  $$(selector)     { return this.#container?.querySelectorAll(selector) ?? []; }

  emit(event, data) { this.bus.emit(event, data); }

  on(event, handler) { this.bus.on(event, handler); }


  #patch() {
    if (!this.#container || !this.#mounted) return;
    const next = this.render();
    this.#container.innerHTML = next;
    this.afterMount();   // re-attach event listeners after re-render
  }
}
