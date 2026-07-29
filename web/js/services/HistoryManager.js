
const STORAGE_KEY = "8d_converter_history";
const MAX_ENTRIES = 20;

export class HistoryManager {
  #entries = [];

  constructor() {
    this.#load();
  }

  getAll() {
    return [...this.#entries];
  }

  add(entry) {
    const record = {
      ...entry,
      timestamp: Date.now(),
    };

    this.#entries = this.#entries.filter(e => e.jobId !== entry.jobId);

    this.#entries.unshift(record);

    if (this.#entries.length > MAX_ENTRIES) {
      this.#entries = this.#entries.slice(0, MAX_ENTRIES);
    }

    this.#persist();
  }

  markExpired(jobId) {
    const entry = this.#entries.find(e => e.jobId === jobId);
    if (entry) {
      entry.expired = true;
      this.#persist();
    }
  }

  clear() {
    this.#entries = [];
    this.#persist();
  }

  get count() {
    return this.#entries.length;
  }


  #load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.#entries = JSON.parse(raw);
      }
    } catch {
      this.#entries = [];
    }
  }

  #persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#entries));
    } catch {
    }
  }
}
