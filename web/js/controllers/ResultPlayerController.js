import { formatTime, updateSliderTrack } from "../utils/sliders.js";

export class ResultPlayerController {
  constructor(refs, bus, converter, settingsController) {
    this.refs = refs;
    this.bus = bus;
    this.converter = converter;
    this.settingsController = settingsController;
    this.audioPlayer = null;
    this.isPlaying = false;
    this.decodedPeaks = null;
    this.rafId = null;
    this.savedVolume = 0.8;
  }

  init(onRestart) {
    this.refs.btnPlayPause.addEventListener("click", () => this.togglePlayback());
    this.refs.volumeSlider.addEventListener("input", () => this.updateVolume());
    this.refs.btnMute.addEventListener("click", () => this.toggleMute());
    this.refs.waveformContainer.addEventListener("click", (event) => this.seek(event));
    this.refs.btnRestart.addEventListener("click", onRestart);
  }

  async finishServerConversion(jobId, format, selectedFile) {
    const baseName = selectedFile?.name ? selectedFile.name.replace(/\.[^/.]+$/, "") : "spatial_render";
    const finalFilename = `${baseName}_8d.${format}`;
    const downloadUrl = this.converter.getDownloadUrl(jobId, finalFilename);
    this.refs.resultFilename.textContent = finalFilename;
    this.refs.resultSize.textContent = "Loading...";
    this.updateResultSettings();
    this.prepareAudio(downloadUrl);
    this.configureDownload(downloadUrl, finalFilename);
    this.configureShare(jobId);
    this.fetchSize(downloadUrl, baseName, format, jobId);
  }

  updateResultSettings() {
    this.refs.resultSettings.innerHTML = `
        <span>SPEED: ${parseFloat(this.refs.speedSlider.value).toFixed(1)}s</span><span class="text-border-color">|</span>
        <span>DEPTH: ${this.refs.depthSlider.value}%</span><span class="text-border-color">|</span>
        <span>REVERB: ${this.refs.reverbSlider.value}%</span><span class="text-border-color">|</span>
        <span>X-FEED: ${this.refs.crossfeedSlider.value}%</span><span class="text-border-color">|</span>
        <span>DAMPING: ${this.refs.dampingSlider.value}%</span>
    `;
  }

  fetchSize(downloadUrl, baseName, format, jobId) {
    let computedSizeMb = null;
    fetch(downloadUrl, { method: "HEAD" })
      .then((response) => {
        const bytes = parseInt(response.headers.get("content-length") || "0", 10);
        if (bytes > 0) {
          computedSizeMb = parseFloat((bytes / (1024 * 1024)).toFixed(1));
          this.refs.resultSize.textContent = `${computedSizeMb} MB`;
        } else {
          this.refs.resultSize.textContent = "Ready";
        }
      })
      .catch(() => {
        this.refs.resultSize.textContent = "Ready";
      })
      .finally(() => {
        this.bus.emit("conversion:complete", {
          jobId,
          filename: baseName,
          format,
          downloadUrl,
          sizeMb: computedSizeMb,
          expiry: Date.now() + 30 * 60 * 1000,
        });
      });
  }

  prepareAudio(url) {
    this.cleanup();
    this.decodeAndCacheAudio(url).then(() => this.updatePlayheadBar(0));
    this.audioPlayer = new Audio(url);
    this.audioPlayer.addEventListener("loadedmetadata", () => this.updateTimeDisplay(0, this.audioPlayer.duration));
    this.audioPlayer.addEventListener("timeupdate", () => this.updateTimeDisplay(this.audioPlayer.currentTime, this.audioPlayer.duration));
    this.audioPlayer.addEventListener("ended", () => this.setPlayingState(false));
    this.setPlayingState(false);
    this.refs.volumeSlider.value = 0.8;
    this.audioPlayer.volume = 0.8;
    updateSliderTrack(this.refs.volumeSlider, this.refs.volumeTrack);
  }

  configureDownload(url, finalFilename) {
    this.refs.btnDownload.onclick = () => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = finalFilename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    };
  }

  configureShare(jobId) {
    if (!this.refs.btnShare) return;
    this.refs.btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">share</span>Share Link';
    this.refs.btnShare.disabled = false;
    const shareStatus = document.getElementById("share-status");
    this.refs.btnShare.onclick = async () => {
      if (!jobId) return;
      try {
        this.refs.btnShare.disabled = true;
        this.refs.btnShare.innerHTML = '<span class="material-symbols-outlined mr-2 animate-spin">refresh</span>Generating...';
        const data = await this.converter.createShareLink(jobId);
        const copied = await this.copyShareUrl(data.shareUrl);
        this.refs.btnShare.innerHTML = copied
          ? '<span class="material-symbols-outlined mr-2">check</span>Copied!'
          : '<span class="material-symbols-outlined mr-2">check</span>Link Ready';
        this.refs.btnShare.classList.add("bg-green-100", "text-green-700", "border-green-200");
        if (shareStatus) {
          const expiryText = data.expiresAt ? `Link expires at ${new Date(data.expiresAt).toLocaleTimeString()}` : "";
          shareStatus.textContent = copied ? expiryText : `${data.shareUrl}  -  ${expiryText}`;
          shareStatus.hidden = false;
          if (!copied) shareStatus.style.userSelect = "text";
        }
        setTimeout(() => this.resetShareButton(), 4000);
      } catch (error) {
        this.refs.btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">error</span>Failed';
        if (shareStatus) {
          shareStatus.textContent = `Error: ${error.message}`;
          shareStatus.hidden = false;
        }
        setTimeout(() => this.resetShareButton(), 3000);
      }
    };
  }

  async copyShareUrl(shareUrl) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        return true;
      }
    } catch {}
    try {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }

  resetShareButton() {
    this.refs.btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">share</span>Share Link';
    this.refs.btnShare.classList.remove("bg-green-100", "text-green-700", "border-green-200");
    this.refs.btnShare.disabled = false;
  }

  async decodeAndCacheAudio(url) {
    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await context.decodeAudioData(buffer);
      this.decodedPeaks = this.extractPeaks(audioBuffer, this.refs.waveformBars.length);
      await context.close();
    } catch {}
  }

  extractPeaks(audioBuffer, numSamples) {
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / numSamples);
    const peaks = new Float32Array(numSamples);
    for (let index = 0; index < numSamples; index += 1) {
      let max = 0;
      for (let offset = 0; offset < step; offset += 1) {
        const value = Math.abs(data[index * step + offset] || 0);
        if (value > max) max = value;
      }
      peaks[index] = max;
    }
    return peaks;
  }

  updateTimeDisplay(current, duration) {
    this.refs.playbackTime.innerHTML = `${formatTime(current)} <span class="text-border-color">/</span> ${formatTime(duration)}`;
  }

  updatePlayheadBar(pct) {
    if (!this.refs.waveformBars || this.refs.waveformBars.length === 0) return;
    const totalBars = this.refs.waveformBars.length;
    const activeIndex = Math.min(Math.floor(pct * totalBars), totalBars - 1);
    this.refs.waveformBars.forEach((bar, index) => {
      if (this.decodedPeaks && this.decodedPeaks.length > index) {
        bar.style.height = `${Math.max(10, this.decodedPeaks[index] * 100)}%`;
      }
      bar.classList.toggle("bg-accent", index === activeIndex);
    });
  }

  renderVisualizerLoop() {
    if (!this.isPlaying || !this.audioPlayer || this.audioPlayer.duration === 0) {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      return;
    }
    this.updatePlayheadBar(this.audioPlayer.currentTime / this.audioPlayer.duration);
    this.rafId = requestAnimationFrame(() => this.renderVisualizerLoop());
  }

  setPlayingState(playing) {
    this.isPlaying = playing;
    this.refs.iconPlay.classList.toggle("hidden", playing);
    this.refs.iconPause.classList.toggle("hidden", !playing);
    this.refs.waveformContainer.classList.toggle("waveform-paused", !playing);
    if (playing && !this.rafId) {
      this.rafId = requestAnimationFrame(() => this.renderVisualizerLoop());
    } else if (!playing && this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (!playing && this.audioPlayer?.duration) {
      this.updatePlayheadBar(this.audioPlayer.currentTime / this.audioPlayer.duration);
    }
  }

  togglePlayback() {
    if (!this.audioPlayer) return;
    if (this.isPlaying) {
      this.audioPlayer.pause();
      this.setPlayingState(false);
    } else {
      this.audioPlayer.play();
      this.setPlayingState(true);
    }
  }

  updateVolume() {
    if (this.audioPlayer) this.audioPlayer.volume = this.refs.volumeSlider.value;
    updateSliderTrack(this.refs.volumeSlider, this.refs.volumeTrack);
    this.updateVolumeIcon(parseFloat(this.refs.volumeSlider.value));
  }

  toggleMute() {
    if (!this.audioPlayer) return;
    if (this.audioPlayer.volume > 0) {
      this.savedVolume = this.audioPlayer.volume;
      this.audioPlayer.volume = 0;
      this.refs.volumeSlider.value = 0;
    } else {
      this.audioPlayer.volume = this.savedVolume;
      this.refs.volumeSlider.value = this.savedVolume;
    }
    updateSliderTrack(this.refs.volumeSlider, this.refs.volumeTrack);
    this.updateVolumeIcon(this.audioPlayer.volume);
  }

  updateVolumeIcon(volume) {
    this.refs.iconVolume.textContent = volume <= 0 ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up";
  }

  seek(event) {
    if (!this.audioPlayer || !this.audioPlayer.duration) return;
    const bars = document.querySelectorAll("#waveform-container .waveform-bar");
    if (bars.length === 0) return;
    const containerRect = event.currentTarget.getBoundingClientRect();
    const firstRect = bars[0].getBoundingClientRect();
    const lastRect = bars[bars.length - 1].getBoundingClientRect();
    const startX = firstRect.left - containerRect.left;
    const endX = lastRect.right - containerRect.left;
    const clickX = event.clientX - containerRect.left;
    const pct = Math.max(0, Math.min(1, (clickX - startX) / (endX - startX)));
    this.audioPlayer.currentTime = pct * this.audioPlayer.duration;
  }

  cleanup() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.removeAttribute("src");
      this.audioPlayer.load();
      this.audioPlayer = null;
    }
    this.decodedPeaks = null;
    this.isPlaying = false;
  }
}
