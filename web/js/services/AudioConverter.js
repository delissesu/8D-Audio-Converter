
export class AudioConverter {
  #baseUrl;

  constructor(baseUrl = "http://localhost:5000") {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
  }

  async startConversion(file, format, params) {
    const formData = new FormData();
    formData.append("file",    file);
    formData.append("format",  format);
    Object.entries(params).forEach(([key, val]) => formData.append(key, val));

    const response = await fetch(`${this.#baseUrl}/convert`, {
      method : "POST",
      body   : formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${response.status}`);
    }

    const data = await response.json();
    return data.jobId;
  }

  async getStatus(jobId) {
    const response = await fetch(`${this.#baseUrl}/status/${jobId}`);
    if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
    return response.json();
  }

  getDownloadUrl(jobId, filename = null) {
    let url = `${this.#baseUrl}/download/${jobId}`;
    if (filename) url += `?name=${encodeURIComponent(filename)}`;
    return url;
  }

  async createShareLink(jobId) {
    const response = await fetch(`${this.#baseUrl}/api/share/${jobId}`, {
      method: "POST"
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Server error: ${response.status}`);
    }
    return response.json();
  }
}
