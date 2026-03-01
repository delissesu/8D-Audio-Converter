// web/js/services/PresetManager.js
// Manages audio effect presets with localStorage persistence and share URLs.
// This is a plain ES module service — not a Component.

const STORAGE_KEY = "8d_converter_presets";
const MAX_USER_PRESETS = 20;

/**
 * Built-in presets — these ship on first visit and cannot be
 * overwritten or deleted by the user.
 * Values are backend-ready: speed in Hz, others 0.0–1.0.
 */
const BUILTIN_PRESETS = {
  "Classic 8D"   : { pan_speed: 0.15, pan_depth: 1.0, room_size: 0.4, wet_level: 0.3, damping: 0.5 },
  "Deep Space"   : { pan_speed: 0.08, pan_depth: 1.0, room_size: 0.9, wet_level: 0.6, damping: 0.3 },
  "Fast Spin"    : { pan_speed: 0.50, pan_depth: 0.9, room_size: 0.3, wet_level: 0.2, damping: 0.7 },
  "Subtle Room"  : { pan_speed: 0.12, pan_depth: 0.5, room_size: 0.5, wet_level: 0.2, damping: 0.6 },
  "Concert Hall" : { pan_speed: 0.10, pan_depth: 0.8, room_size: 0.8, wet_level: 0.5, damping: 0.4 },
};

export class PresetManager {
  /** @type {Map<string, {params: object, savedAt: number}>} */
  #userPresets = new Map();

  constructor() {
    this.#load();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Return all presets: built-in first, then user presets.
   * @returns {Array<{name: string, params: object, isBuiltin: boolean}>}
   */
  getAll() {
    const list = [];

    // Built-in presets first
    for (const [name, params] of Object.entries(BUILTIN_PRESETS)) {
      list.push({ name, params: { ...params }, isBuiltin: true });
    }

    // User presets, newest first
    const userEntries = [...this.#userPresets.entries()]
      .sort((a, b) => b[1].savedAt - a[1].savedAt);

    for (const [name, entry] of userEntries) {
      list.push({ name, params: { ...entry.params }, isBuiltin: false });
    }

    return list;
  }

  /**
   * Get a single preset by name (searches built-in first, then user).
   * @param {string} name
   * @returns {object|null} params object or null
   */
  get(name) {
    if (BUILTIN_PRESETS[name]) {
      return { ...BUILTIN_PRESETS[name] };
    }
    const entry = this.#userPresets.get(name);
    return entry ? { ...entry.params } : null;
  }

  /**
   * Save a user preset. If limit exceeded, drops the oldest.
   * Cannot overwrite a built-in preset name.
   * @param {string} name
   * @param {object} params — { pan_speed, pan_depth, room_size, wet_level, damping }
   * @returns {boolean} true if saved, false if name is reserved
   */
  save(name, params) {
    if (BUILTIN_PRESETS[name]) return false; // can't overwrite built-in

    this.#userPresets.set(name, {
      params: { ...params },
      savedAt: Date.now(),
    });

    // Enforce max limit — drop oldest
    if (this.#userPresets.size > MAX_USER_PRESETS) {
      const entries = [...this.#userPresets.entries()]
        .sort((a, b) => a[1].savedAt - b[1].savedAt);
      this.#userPresets.delete(entries[0][0]);
    }

    this.#persist();
    return true;
  }

  /**
   * Delete a user preset. Built-in presets cannot be deleted.
   * @param {string} name
   * @returns {boolean}
   */
  delete(name) {
    if (BUILTIN_PRESETS[name]) return false;
    const deleted = this.#userPresets.delete(name);
    if (deleted) this.#persist();
    return deleted;
  }

  /**
   * Generate a shareable URL for a preset.
   * @param {string} name
   * @returns {string|null}
   */
  getShareUrl(name) {
    const params = this.get(name);
    if (!params) return null;
    const encoded = btoa(JSON.stringify(params));
    return `${location.origin}${location.pathname}?preset=${encoded}`;
  }

  /**
   * Parse preset params from the current page URL's ?preset= query param.
   * @returns {object|null} params object or null if not found/invalid
   */
  static fromUrl() {
    const url = new URL(location.href);
    const raw = url.searchParams.get("preset");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(atob(raw));
      // Validate the shape — must have all 5 required keys
      const required = ["pan_speed", "pan_depth", "room_size", "wet_level", "damping"];
      for (const key of required) {
        if (typeof parsed[key] !== "number") return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  // ── Private ────────────────────────────────────────────────────

  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const entries = JSON.parse(raw);
        this.#userPresets = new Map(entries);
      }
    } catch {
      this.#userPresets = new Map();
    }
  }

  #persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...this.#userPresets])
      );
    } catch {
      // localStorage full or unavailable — fail silently
    }
  }
}
