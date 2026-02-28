// web/js/services/AudioConverter.js
// SOLID: S — handles ONLY HTTP communication with the backend
// SOLID: D — baseUrl injected, not hardcoded

export class AudioConverter {
  #baseUrl;

  /**
   * @param {string} baseUrl - API base URL (e.g., "http://localhost:5000")
   */
  constructor(baseUrl = "http://localhost:5000") {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Starts a conversion job.
   * @param {File}   file    - The audio file to upload
   * @param {string} format  - Output format (e.g., "mp3", "wav")
   * @param {Object} params  - Effect parameters { speed, depth, room, wet, damping }
   * @returns {Promise<string>} jobId
   */
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

  /**
   * Polls job status.
   * @param {string} jobId
   * @returns {Promise<{ status, progress, step, error }>}
   */
  async getStatus(jobId) {
    const response = await fetch(`${this.#baseUrl}/status/${jobId}`);
    if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
    return response.json();
  }

  /**
   * Returns the download URL for a completed job.
   * @param {string} jobId
   * @param {string} [filename] - Optional filename to force down
   * @returns {string}
   */
  getDownloadUrl(jobId, filename = null) {
    let url = `${this.#baseUrl}/download/${jobId}`;
    if (filename) url += `?name=${encodeURIComponent(filename)}`;
    return url;
  }
}
