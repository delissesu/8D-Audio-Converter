
const STORAGE_KEY = "8d_converter_presets";
const MAX_USER_PRESETS = 20;

const BUILTIN_PRESETS = {
  "Classic 8D"   : { pan_speed: 0.15, pan_depth: 1.0, room_size: 0.4, wet_level: 0.3, damping: 0.5 },
  "Deep Space"   : { pan_speed: 0.08, pan_depth: 1.0, room_size: 0.9, wet_level: 0.6, damping: 0.3 },
  "Fast Spin"    : { pan_speed: 0.50, pan_depth: 0.9, room_size: 0.3, wet_level: 0.2, damping: 0.7 },
  "Subtle Room"  : { pan_speed: 0.12, pan_depth: 0.5, room_size: 0.5, wet_level: 0.2, damping: 0.6 },
  "Concert Hall" : { pan_speed: 0.10, pan_depth: 0.8, room_size: 0.8, wet_level: 0.5, damping: 0.4 },
};

export class PresetManager {
  #userPresets = new Map();

  constructor() {
    this.#load();
  }


  getAll() {
    const list = [];

    for (const [name, params] of Object.entries(BUILTIN_PRESETS)) {
      list.push({ name, params: { ...params }, isBuiltin: true });
    }

    const userEntries = [...this.#userPresets.entries()]
      .sort((a, b) => b[1].savedAt - a[1].savedAt);

    for (const [name, entry] of userEntries) {
      list.push({ name, params: { ...entry.params }, isBuiltin: false });
    }

    return list;
  }

  get(name) {
    if (BUILTIN_PRESETS[name]) {
      return { ...BUILTIN_PRESETS[name] };
    }
    const entry = this.#userPresets.get(name);
    return entry ? { ...entry.params } : null;
  }

  save(name, params) {
    if (BUILTIN_PRESETS[name]) return false; // can't overwrite built-in

    this.#userPresets.set(name, {
      params: { ...params },
      savedAt: Date.now(),
    });

    if (this.#userPresets.size > MAX_USER_PRESETS) {
      const entries = [...this.#userPresets.entries()]
        .sort((a, b) => a[1].savedAt - b[1].savedAt);
      this.#userPresets.delete(entries[0][0]);
    }

    this.#persist();
    return true;
  }

  delete(name) {
    if (BUILTIN_PRESETS[name]) return false;
    const deleted = this.#userPresets.delete(name);
    if (deleted) this.#persist();
    return deleted;
  }

  getShareUrl(name) {
    const params = this.get(name);
    if (!params) return null;
    const encoded = btoa(JSON.stringify(params));
    return `${location.origin}${location.pathname}?preset=${encoded}`;
  }

  static fromUrl() {
    const url = new URL(location.href);
    const raw = url.searchParams.get("preset");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(atob(raw));
      const required = ["pan_speed", "pan_depth", "room_size", "wet_level", "damping"];
      for (const key of required) {
        if (typeof parsed[key] !== "number") return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }


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
    }
  }
}
