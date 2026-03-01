import { AudioConverter } from "./services/AudioConverter.js";
import { PresetPickerComponent } from "./components/PresetPickerComponent.js";
import { PresetManager } from "./services/PresetManager.js";
import { RealtimePreview } from "./services/RealtimePreview.js";
import { PreviewToggleComponent } from "./components/PreviewToggleComponent.js";
import { HistoryPanelComponent } from "./components/HistoryPanelComponent.js";
import { FileQueueComponent } from "./components/FileQueueComponent.js";
import { WaveformEditorComponent } from "./components/WaveformEditorComponent.js";
import { BrowserDSP } from "./services/BrowserDSP.js";
import { EventBus } from "./core/EventBus.js";

const converter = new AudioConverter("");
const bus = EventBus.getInstance();
const browserDSP = new BrowserDSP();

// Global trim state
let currentTrimStart = 0;
let currentTrimEnd = 0;

// ── Security helpers ────────────────────────────────────────────
function escapeHTML(str) {
    const el = document.createElement("div");
    el.appendChild(document.createTextNode(str));
    return el.innerHTML;
}

const ALLOWED_TYPES = new Set([
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac",
    "audio/ogg", "audio/aac", "audio/x-m4a", "audio/mp4",
]);
const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function validateFile(file) {
    if (!file.type || (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith('audio/'))) {
        return "Unsupported file type. Use MP3, WAV, FLAC, OGG, AAC, or M4A.";
    }
    if (file.size > MAX_SIZE_BYTES) {
        return "File is too large. Maximum size is 100 MB.";
    }
    if (file.size === 0) {
        return "File is empty.";
    }
    return null;
}

// --- DOM Elements ---
// Views
const views = {
    upload: document.getElementById('view-upload'),
    processing: document.getElementById('view-processing'),
    result: document.getElementById('view-result'),
    error: document.getElementById('view-error')
};

// Upload View
const dropZone = document.getElementById('drop-zone');
const audioInput = document.getElementById('audio-input');
const dropPrimaryText = document.getElementById('drop-primary-text');
const dropSecondaryText = document.getElementById('drop-secondary-text');
const formatRadios = document.querySelectorAll('.form-format');
const btnConvert = document.getElementById('btn-convert');

const speedSlider = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const speedTrack = document.getElementById('speed-track');

const reverbSlider = document.getElementById('reverb');
const reverbVal = document.getElementById('reverb-val');
const reverbTrack = document.getElementById('reverb-track');

const crossfeedSlider = document.getElementById('crossfeed');
const crossfeedVal = document.getElementById('crossfeed-val');
const crossfeedTrack = document.getElementById('crossfeed-track');

const depthSlider = document.getElementById('depth');
const depthVal = document.getElementById('depth-val');
const depthTrack = document.getElementById('depth-track');

const dampingSlider = document.getElementById('damping');
const dampingVal = document.getElementById('damping-val');
const dampingTrack = document.getElementById('damping-track');

// Processing View
const progressCircle = document.getElementById('progress-circle');
const statusDetail = document.getElementById('status-detail');
const btnCancel = document.getElementById('btn-cancel');

// Mute button
const btnMute = document.getElementById('btn-mute');
const iconVolume = document.getElementById('icon-volume');
let savedVolume = 0.8;

// Result View
const resultFilename = document.getElementById('result-filename');
const resultSize = document.getElementById('result-size');
const playbackTime = document.getElementById('playback-time');
const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const volumeSlider = document.getElementById('volume-slider');
const volumeTrack = document.getElementById('volume-track');
const btnDownload = document.getElementById('btn-download');
const btnShare = document.getElementById('btn-share');
const btnRestart = document.getElementById('btn-restart');
const resultSettings = document.getElementById('result-settings');
const waveformBars = document.querySelectorAll('#waveform-container .waveform-bar');

// Error View
const errorMessage = document.getElementById('error-message');
const errorCode = document.getElementById('error-code');
const btnErrRetry = document.getElementById('btn-err-retry');
const btnErrBack = document.getElementById('btn-err-back');

// --- Global State ---
let selectedFile = null;
let currentJobId = null;
let pollingInterval = null;
let abortController = new AbortController();
let audioPlayer = null;
let isPlaying = false;
let audioCtx = null;
let decodedPeaks = null;
let rafId = null;

// --- View Router ---
function showView(viewName) {
    Object.values(views).forEach(v => v.classList.add('view-hidden'));
    views[viewName].classList.remove('view-hidden');
}

// --- Upload & Config Logic ---
// Drag and Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
    });
});

['dragenter', 'dragover'].forEach(evt => {
    dropZone.addEventListener(evt, () => dropZone.classList.add('drop-active'));
});

['dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, () => dropZone.classList.remove('drop-active'));
});

dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length > 1) {
        // Multi-file drop → batch queue
        fileQueue.addFiles(files);
    } else if (files.length === 1) {
        handleFile(files[0]);
    }
});

audioInput.addEventListener('change', () => {
    if (audioInput.files.length > 1) {
        fileQueue.addFiles(audioInput.files);
    } else if (audioInput.files.length === 1) {
        handleFile(audioInput.files[0]);
    }
});

function handleFile(file) {
    // P1: Client-side file validation
    const error = validateFile(file);
    if (error) {
        alert(error);
        return;
    }
    selectedFile = file;
    // P1: Use textContent (safe) — never innerHTML with user data
    dropPrimaryText.textContent = file.name;
    dropSecondaryText.textContent = (file.size / (1024 * 1024)).toFixed(2) + " MB";
    dropPrimaryText.classList.add('text-accent');
    btnConvert.removeAttribute('disabled');
    btnConvert.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-muted');
    btnConvert.classList.add('bg-primary', 'hover:bg-primary-hover', 'shadow-lg');
    bus.emit('file:selected', file);
}

// Sliders formatting
function updateSliderTrack(slider, track, reverse = false) {
    let pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    if (reverse) pct = 100 - pct; // For speed, lower number = faster (so more "filled" visually is up to choice, but let's stick to standard)
    track.style.width = `${pct}%`;
}

speedSlider.addEventListener('input', () => {
    speedVal.textContent = parseFloat(speedSlider.value).toFixed(1) + 's';
    updateSliderTrack(speedSlider, speedTrack);
    updatePreviewIfPlaying();
});

reverbSlider.addEventListener('input', () => {
    reverbVal.textContent = reverbSlider.value + '%';
    updateSliderTrack(reverbSlider, reverbTrack);
    updatePreviewIfPlaying();
});

crossfeedSlider.addEventListener('input', () => {
    crossfeedVal.textContent = crossfeedSlider.value + '%';
    updateSliderTrack(crossfeedSlider, crossfeedTrack);
    updatePreviewIfPlaying();
});

depthSlider.addEventListener('input', () => {
    depthVal.textContent = depthSlider.value + '%';
    updateSliderTrack(depthSlider, depthTrack);
    updatePreviewIfPlaying();
});

dampingSlider.addEventListener('input', () => {
    dampingVal.textContent = dampingSlider.value + '%';
    updateSliderTrack(dampingSlider, dampingTrack);
    updatePreviewIfPlaying();
});

// Init tracks
updateSliderTrack(speedSlider, speedTrack);
updateSliderTrack(reverbSlider, reverbTrack);
updateSliderTrack(crossfeedSlider, crossfeedTrack);
updateSliderTrack(depthSlider, depthTrack);
updateSliderTrack(dampingSlider, dampingTrack);

// ── Preset System ───────────────────────────────────────────────

/**
 * Read current slider positions and return backend-ready params.
 * Speed: slider value in seconds → Hz = 1/seconds
 * Others: slider 0–100 → 0.0–1.0
 */
function getCurrentParams() {
  const speedSeconds = parseFloat(speedSlider.value);
  return {
    pan_speed:  Math.min(2.0, Math.max(0.01, 1.0 / speedSeconds)),
    pan_depth:  depthSlider.value / 100,
    room_size:  reverbSlider.value / 100,
    wet_level:  crossfeedSlider.value / 100,
    damping:    dampingSlider.value / 100,
  };
}

/**
 * Apply preset params (backend-ready) to the slider UI.
 * Reverse-maps Hz → seconds, 0–1 → 0–100.
 */
function applyPresetToSliders(params) {
  // Speed: Hz → seconds.  Hz = 1/s → s = 1/Hz
  const seconds = Math.min(10, Math.max(1, Math.round((1.0 / params.pan_speed) * 2) / 2));
  speedSlider.value = seconds;
  speedVal.textContent = parseFloat(seconds).toFixed(1) + 's';
  updateSliderTrack(speedSlider, speedTrack);

  // Depth: 0–1 → 0–100
  depthSlider.value = Math.round(params.pan_depth * 100);
  depthVal.textContent = depthSlider.value + '%';
  updateSliderTrack(depthSlider, depthTrack);

  // Room size: 0–1 → 0–100
  reverbSlider.value = Math.round(params.room_size * 100);
  reverbVal.textContent = reverbSlider.value + '%';
  updateSliderTrack(reverbSlider, reverbTrack);

  // Wet level (crossfeed): 0–1 → 0–100
  crossfeedSlider.value = Math.round(params.wet_level * 100);
  crossfeedVal.textContent = crossfeedSlider.value + '%';
  updateSliderTrack(crossfeedSlider, crossfeedTrack);

  // Damping: 0–1 → 0–100
  dampingSlider.value = Math.round(params.damping * 100);
  dampingVal.textContent = dampingSlider.value + '%';
  updateSliderTrack(dampingSlider, dampingTrack);
}

// Mount Preset Picker
const presetPicker = new PresetPickerComponent();
const presetSlot = document.getElementById('preset-picker-slot');
if (presetSlot) {
  presetPicker.mount(presetSlot);
}

// Mount History Panel
const historyPanel = new HistoryPanelComponent();
const historySlot = document.getElementById('history-panel-slot');
if (historySlot) {
  historyPanel.mount(historySlot);
}

// Mount File Queue (Batch)
const fileQueue = new FileQueueComponent();
const fileQueueSlot = document.getElementById('file-queue-slot');
if (fileQueueSlot) {
  fileQueue.mount(fileQueueSlot);
}

// Mount Waveform Editor (Trim)
const waveformEditor = new WaveformEditorComponent();
const waveformSlot = document.getElementById('waveform-editor-slot');
if (waveformSlot) {
  waveformEditor.mount(waveformSlot);
}

// Listen for trim changes
bus.on('trim:changed', ({ start, end }) => {
  currentTrimStart = start;
  currentTrimEnd = end;
});

// Listen for preset:loaded → update sliders
bus.on('preset:loaded', (params) => {
  applyPresetToSliders(params);
});

// Listen for preset:request-params → respond with current slider values
bus.on('preset:request-params', () => {
  bus.emit('preset:request-params-response', getCurrentParams());
});

// Auto-load preset from URL (share link)
const urlPreset = PresetManager.fromUrl();
if (urlPreset) {
  applyPresetToSliders(urlPreset);
}

// ── Real-Time Preview System ────────────────────────────────────
const realtimePreview = new RealtimePreview();
const previewToggle = new PreviewToggleComponent();
const previewToggleSlot = document.getElementById('preview-toggle-slot');
if (previewToggleSlot) {
  previewToggle.mount(previewToggleSlot);
}

// Handle preview start: load excerpt then play with current params
bus.on('preview:start', async () => {
  if (!selectedFile) return;
  try {
    // Read latest trim values at preview start time
    const trim = waveformEditor?.getTrimValues() ?? { start: 0, end: 0 };
    await realtimePreview.loadExcerpt(selectedFile, trim);
    bus.emit('preview:loaded');
    await realtimePreview.play(getCurrentParams());
  } catch (err) {
    console.warn('Preview failed:', err);
    bus.emit('preview:error');
  }
});

// Handle preview stop
bus.on('preview:stop', () => {
  realtimePreview.stop();
});

// Stop preview when conversion starts
bus.on('conversion:start', () => {
  realtimePreview.stop();
  previewToggle.setInactive();
});

// Live-update preview when sliders change
function updatePreviewIfPlaying() {
  if (realtimePreview.isPlaying) {
    realtimePreview.updateParams(getCurrentParams());
  }
}

// Convert Action
btnConvert.addEventListener('click', async () => {
    if (!selectedFile || btnConvert.disabled) return;

    // Disable to prevent double-click
    btnConvert.setAttribute('disabled', 'true');
    btnConvert.classList.add('opacity-50', 'cursor-not-allowed');

    // Build params
    let selectedFormat = 'mp3';
    formatRadios.forEach(r => { if (r.checked) selectedFormat = r.value; });

    // Map UI values to backend-expected ranges:
    //   speed slider: 1–10 seconds → pan_speed Hz = 1/seconds (clamped 0.01–2.0)
    //   reverb slider: 0–100% → room_size 0.0–1.0
    //   crossfeed slider: 0–100% → wet_level 0.0–1.0
    const speedSeconds = parseFloat(speedSlider.value);
    const panSpeedHz = Math.min(2.0, Math.max(0.01, 1.0 / speedSeconds));

    const params = {
        speed: panSpeedHz,
        room: reverbSlider.value / 100,
        depth: depthSlider.value / 100,
        wet: crossfeedSlider.value / 100,
        damping: dampingSlider.value / 100,
        trim_start: currentTrimStart,
        trim_end: currentTrimEnd,
    };

    try {
        showView('processing');
        bus.emit('conversion:start');

        // Size-based routing: files < 10MB → in-browser DSP
        if (browserDSP.shouldProcessLocally(selectedFile) && selectedFormat === 'wav') {
            startProgressAnim("Processing in browser...");
            const dspParams = {
                pan_speed: panSpeedHz,
                pan_depth: params.depth,
                room_size: params.room,
                wet_level: params.wet,
                damping: params.damping,
                trim_start: params.trim_start,
                trim_end: params.trim_end
            };
            const wavBlob = await browserDSP.process(selectedFile, dspParams, (pct) => {
                updateProgressBar(pct);
            });
            // Create a download URL from the blob
            const url = URL.createObjectURL(wavBlob);
            const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
            finishConversionLocal(url, baseName + '_8d.wav', selectedFile, selectedFormat);
        } else {
            startProgressAnim("Uploading audio...");
            currentJobId = await converter.startConversion(selectedFile, selectedFormat, params);
            pollStatus(currentJobId, selectedFormat);
        }
    } catch (err) {
        showError(err.message, "ERR_UPLOAD");
    } finally {
        // Re-enable convert button if we return to upload view
        if (selectedFile) {
            btnConvert.removeAttribute('disabled');
            btnConvert.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
});

// --- Processing Logic ---
const circumference = 289; // 2 * pi * 46

let lastStatusText = '';

function startProgressAnim(text) {
    lastStatusText = text;
    statusDetail.textContent = text;
    statusDetail.style.opacity = '1';
    progressCircle.style.strokeDashoffset = circumference;
}

function updateProgressBar(pct) {
    const offset = circumference - (pct / 100) * circumference;
    if (progressCircle.style.strokeDashoffset !== `${offset}px`) {
        progressCircle.style.strokeDashoffset = offset;
    }
}

function stopPolling() {
    if (pollingInterval !== null) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

btnCancel.addEventListener('click', () => {
    stopPolling();
    cleanupAudioAndPolling();
    resetUpload();
    showView('upload');
});

// P0 Fix 1: Stop polling explicitly, use AbortController
function pollStatus(jobId, overrideFormat) {
    pollingInterval = setInterval(async () => {
        try {
            const status = await converter.getStatus(jobId);
            
            // Update progress circle safely
            const pct = status.progress || 0;
            const offset = circumference - (pct / 100) * circumference;
            // P0 Fix 2: Avoid DOM write if it hasn't changed
            if (progressCircle.style.strokeDashoffset !== `${offset}px`) {
                progressCircle.style.strokeDashoffset = offset;
            }
            
            // Update text only when it changes (prevents flicker / DOM reparse)
            const newText = status.step || "Processing...";
            if (newText !== lastStatusText) {
                lastStatusText = newText;
                statusDetail.style.opacity = '0';
                setTimeout(() => {
                    statusDetail.textContent = newText;
                    statusDetail.style.opacity = '1';
                }, 150);
            }

            if (status.status === "done") {
                stopPolling();
                finishConversion(jobId, overrideFormat);
            } else if (status.status === "error") {
                stopPolling();
                showError(status.error, "ERR_CONVERT");
            }
        } catch (e) {
            stopPolling();
            showError("Connection lost", "ERR_NETWORK");
        }
    }, 800);
}

function finishConversion(jobId, format) {
    // Set UI - preserve original filename and append _8d
    let baseName = "spatial_render";
    if (selectedFile && selectedFile.name) {
        // Strip extension
        baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
    }
    const finalFilename = `${baseName}_8d.${format}`;
    
    // Get download URL using the dynamically generated filename
    const downloadUrl = converter.getDownloadUrl(jobId, finalFilename);
    
    resultFilename.textContent = finalFilename;
    resultSize.textContent = "Loading...";

    let computedSizeMb = null;

    // Fetch file size via HEAD request
    fetch(downloadUrl, { method: 'HEAD' })
        .then(res => {
            const bytes = parseInt(res.headers.get('content-length') || '0', 10);
            if (bytes > 0) {
                computedSizeMb = parseFloat((bytes / (1024 * 1024)).toFixed(1));
                resultSize.textContent = computedSizeMb + ' MB';
            } else {
                resultSize.textContent = 'Ready';
            }
        })
        .catch(() => { resultSize.textContent = 'Ready'; })
        .finally(() => {
            // Emit conversion complete event for HistoryManager after size is known
            bus.emit('conversion:complete', {
                filename: baseName,
                format: format,
                url: downloadUrl,
                sizeMb: computedSizeMb,
                expiry: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
            });
        });
    
    resultSettings.innerHTML = `
        <span>SPEED: ${parseFloat(speedSlider.value).toFixed(1)}s</span><span class="text-border-color">|</span>
        <span>DEPTH: ${depthSlider.value}%</span><span class="text-border-color">|</span>
        <span>REVERB: ${reverbSlider.value}%</span><span class="text-border-color">|</span>
        <span>X-FEED: ${crossfeedSlider.value}%</span><span class="text-border-color">|</span>
        <span>DAMPING: ${dampingSlider.value}%</span>
    `;

    // Properly clean up old audio player
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.removeAttribute('src');
        audioPlayer.load(); // Release media resources
        audioPlayer = null;
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    
    // P0 Fix 3: Decode once and cache peaks for the visualizer
    decodeAndCacheAudio(downloadUrl).then(() => {
        // Render static waveform initially
        updatePlayheadBar(0);
    });

    audioPlayer = new Audio(downloadUrl);
    
    audioPlayer.addEventListener('loadedmetadata', () => {
        updateTimeDisplay(0, audioPlayer.duration);
    });
    
    audioPlayer.addEventListener('timeupdate', () => {
        updateTimeDisplay(audioPlayer.currentTime, audioPlayer.duration);
    });

    audioPlayer.addEventListener('ended', () => {
        setPlayingState(false);
    });

    btnDownload.onclick = () => {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    if (btnShare) {
        // Reset share button
        btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">share</span>Share Link';
        btnShare.disabled = false;
        
        const shareStatus = document.getElementById('share-status');

        btnShare.onclick = async () => {
            try {
                btnShare.disabled = true;
                btnShare.innerHTML = '<span class="material-symbols-outlined mr-2 animate-spin">refresh</span>Generating...';
                
                const data = await converter.createShareLink(jobId);
                await navigator.clipboard.writeText(data.shareUrl);
                
                btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">check</span>Copied!';
                btnShare.classList.add('bg-green-100', 'text-green-700', 'border-green-200');

                if (shareStatus) {
                    shareStatus.textContent = `Link expires at ${new Date(data.expiresAt).toLocaleTimeString()}`;
                    shareStatus.hidden = false;
                }
                
                setTimeout(() => {
                    btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">share</span>Share Link';
                    btnShare.classList.remove('bg-green-100', 'text-green-700', 'border-green-200');
                    btnShare.disabled = false;
                }, 3000);
            } catch (err) {
                console.error("Share failed", err);
                btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">error</span>Failed';
                setTimeout(() => {
                    btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">share</span>Share Link';
                    btnShare.disabled = false;
                }, 2000);
            }
        };
    }

    setPlayingState(false);
    volumeSlider.value = 0.8;
    audioPlayer.volume = 0.8;
    updateSliderTrack(volumeSlider, volumeTrack);

    // (Event emitted inside the HEAD request handler above)

    showView('result');
}

function finishConversionLocal(url, finalFilename, file, format) {
    resultFilename.textContent = finalFilename;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    resultSize.textContent = `${sizeMb} MB (Local)`;

    resultSettings.innerHTML = `
        <span>SPEED: ${parseFloat(speedSlider.value).toFixed(1)}s</span><span class="text-border-color">|</span>
        <span>DEPTH: ${depthSlider.value}%</span><span class="text-border-color">|</span>
        <span>REVERB: ${reverbSlider.value}%</span><span class="text-border-color">|</span>
        <span>X-FEED: ${crossfeedSlider.value}%</span><span class="text-border-color">|</span>
        <span>DAMPING: ${dampingSlider.value}%</span>
    `;

    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.removeAttribute('src');
        audioPlayer.load();
        audioPlayer = null;
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    decodeAndCacheAudio(url).then(() => updatePlayheadBar(0));

    audioPlayer = new Audio(url);
    audioPlayer.addEventListener('loadedmetadata', () => updateTimeDisplay(0, audioPlayer.duration));
    audioPlayer.addEventListener('timeupdate', () => updateTimeDisplay(audioPlayer.currentTime, audioPlayer.duration));
    audioPlayer.addEventListener('ended', () => setPlayingState(false));

    btnDownload.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = finalFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    if (btnShare) {
        btnShare.disabled = true;
        btnShare.title = "Share link is only available for cloud conversions";
        btnShare.innerHTML = '<span class="material-symbols-outlined mr-2">cloud_off</span>Local Output';
    }

    bus.emit('conversion:complete', {
        filename: finalFilename.replace(/\.[^/.]+$/, ""),
        format: format,
        url: url,
        size: `${sizeMb} MB`,
        expiry: Date.now() + (24 * 60 * 60 * 1000)
    });

    showView('result');
}

// --- Audio decoding and Visualizer (P0 Fix 3) ---
async function decodeAndCacheAudio(url) {
    try {
        const resp = await fetch(url);
        const buf = await resp.arrayBuffer();
        const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuf = await tmpCtx.decodeAudioData(buf);
        
        // Use the total number of bars in the DOM
        const numSamples = waveformBars.length; 
        decodedPeaks = extractPeaks(audioBuf, numSamples);
        await tmpCtx.close();
    } catch (e) {
        console.warn("Could not decode audio for visualizer:", e);
    }
}

function extractPeaks(audioBuf, numSamples) {
    const data = audioBuf.getChannelData(0);
    const step = Math.ceil(data.length / numSamples);
    const peaks = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        let max = 0;
        for (let j = 0; j < step; j++) {
            const v = Math.abs(data[i * step + j] || 0);
            if (v > max) max = v;
        }
        peaks[i] = max;
    }
    return peaks;
}

function updateTimeDisplay(current, duration) {
    const formatTime = (sec) => {
        if(isNaN(sec)) return "00:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    playbackTime.innerHTML = `${formatTime(current)} <span class="text-border-color">/</span> ${formatTime(duration)}`;
}

function updatePlayheadBar(pct) {
    if (!waveformBars || waveformBars.length === 0) return;
    const totalBars = waveformBars.length;
    const activeIndex = Math.min(Math.floor(pct * totalBars), totalBars - 1);
    
    waveformBars.forEach((bar, i) => {
        // If we have actual peaks, scale the bar height dynamically
        if (decodedPeaks && decodedPeaks.length > i) {
            // Apply a minimum height of 10% and maximum of 100%
            const heightPct = Math.max(10, decodedPeaks[i] * 100);
            bar.style.height = `${heightPct}%`;
        }
        
        // Highlight active playhead
        if (i === activeIndex) {
            bar.classList.add('bg-accent');
        } else {
            bar.classList.remove('bg-accent');
        }
    });
}

function renderVisualizerLoop() {
    if (!isPlaying || !audioPlayer || audioPlayer.duration === 0) {
        // P0 Fix 4: RAF stops when paused
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        return;
    }
    
    const pct = audioPlayer.currentTime / audioPlayer.duration;
    updatePlayheadBar(pct);
    
    rafId = requestAnimationFrame(renderVisualizerLoop);
}

function setPlayingState(playing) {
    isPlaying = playing;
    const container = document.getElementById('waveform-container');
    if (playing) {
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
        container.classList.remove('waveform-paused');
        
        // P0 Fix 4: Start RAF loop
        if (!rafId) {
            rafId = requestAnimationFrame(renderVisualizerLoop);
        }
    } else {
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
        container.classList.add('waveform-paused');
        
        // P0 Fix 4: Stop RAF loop explicitly
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        
        // Snap final position
        if (audioPlayer && audioPlayer.duration) {
            const pct = audioPlayer.currentTime / audioPlayer.duration;
            updatePlayheadBar(pct);
        }
    }
}

btnPlayPause.addEventListener('click', () => {
    if (!audioPlayer) return;
    if (isPlaying) {
        audioPlayer.pause();
        setPlayingState(false);
    } else {
        audioPlayer.play();
        setPlayingState(true);
    }
});

volumeSlider.addEventListener('input', () => {
    if (audioPlayer) audioPlayer.volume = volumeSlider.value;
    updateSliderTrack(volumeSlider, volumeTrack);
    updateVolumeIcon(parseFloat(volumeSlider.value));
});

// Mute toggle
btnMute.addEventListener('click', () => {
    if (!audioPlayer) return;
    if (audioPlayer.volume > 0) {
        savedVolume = audioPlayer.volume;
        audioPlayer.volume = 0;
        volumeSlider.value = 0;
    } else {
        audioPlayer.volume = savedVolume;
        volumeSlider.value = savedVolume;
    }
    updateSliderTrack(volumeSlider, volumeTrack);
    updateVolumeIcon(audioPlayer.volume);
});

function updateVolumeIcon(vol) {
    if (vol <= 0) {
        iconVolume.textContent = 'volume_off';
    } else if (vol < 0.5) {
        iconVolume.textContent = 'volume_down';
    } else {
        iconVolume.textContent = 'volume_up';
    }
}

// Waveform click-to-seek
document.getElementById('waveform-container').addEventListener('click', (e) => {
    if (!audioPlayer || !audioPlayer.duration) return;
    const bars = document.querySelectorAll('#waveform-container .waveform-bar');
    if (bars.length === 0) return;
    const containerRect = e.currentTarget.getBoundingClientRect();
    const firstRect = bars[0].getBoundingClientRect();
    const lastRect = bars[bars.length - 1].getBoundingClientRect();
    const startX = firstRect.left - containerRect.left;
    const endX = lastRect.right - containerRect.left;
    const clickX = e.clientX - containerRect.left;
    const pct = Math.max(0, Math.min(1, (clickX - startX) / (endX - startX)));
    audioPlayer.currentTime = pct * audioPlayer.duration;
});

btnRestart.addEventListener('click', () => {
    stopPolling();
    cleanupAudioAndPolling();
    resetUpload();
    showView('upload');
});

function cleanupAudioAndPolling() {
    stopPolling();
    abortController.abort();
    abortController = new AbortController();
    
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    
    // Properly release audio resources
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer.removeAttribute('src');
        audioPlayer.load();
        audioPlayer = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close();
        audioCtx = null;
    }
    decodedPeaks = null;
    isPlaying = false;
    lastStatusText = '';
}

// --- Error Logic ---
function showError(msg, code) {
    errorMessage.textContent = msg || "An unknown error occurred.";
    errorCode.textContent = code || "ERR_UNKNOWN";
    showView('error');
}

btnErrBack.addEventListener('click', () => {
    stopPolling();
    cleanupAudioAndPolling();
    resetUpload();
    showView('upload');
});

btnErrRetry.addEventListener('click', () => {
    stopPolling();
    cleanupAudioAndPolling();
    if (selectedFile) {
        // Re-enable convert button before clicking
        btnConvert.removeAttribute('disabled');
        btnConvert.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-muted');
        btnConvert.classList.add('bg-primary', 'hover:bg-primary-hover', 'shadow-lg');
        btnConvert.click();
    } else {
        showView('upload');
    }
});

// --- Utilities ---
function resetUpload() {
    selectedFile = null;
    audioInput.value = '';
    dropPrimaryText.textContent = "Drop audio source";
    dropSecondaryText.textContent = "MP3, WAV, FLAC, OGG, AAC, M4A";
    dropPrimaryText.classList.remove('text-accent');
    btnConvert.setAttribute('disabled', 'true');
    btnConvert.classList.add('opacity-50', 'cursor-not-allowed', 'bg-muted');
    btnConvert.classList.remove('bg-primary', 'hover:bg-primary-hover', 'shadow-lg');
    // Stop and cleanup preview
    realtimePreview.teardown();
    previewToggle.setInactive();
    bus.emit('app:reset');
}
