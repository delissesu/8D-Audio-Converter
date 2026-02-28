// web/js/app.js — Composition root (refactored with Component architecture)
import { EventBus }               from "./core/EventBus.js";
import { DropZoneComponent }      from "./components/DropZoneComponent.js";
import { ParameterFormComponent } from "./components/ParameterFormComponent.js";
import { FormatPickerComponent }  from "./components/FormatPickerComponent.js";
import { ProgressComponent }      from "./components/ProgressComponent.js";
import { AudioPlayerComponent }   from "./components/AudioPlayerComponent.js";
import { ResultComponent }        from "./components/ResultComponent.js";
import { AudioConverter }         from "./services/AudioConverter.js";

const bus       = EventBus.getInstance();
const converter = new AudioConverter("http://localhost:5000");

// ── Mount components into DOM slots ─────────────────────────────
const dropZone   = new DropZoneComponent();
const paramForm  = new ParameterFormComponent();
const formatPick = new FormatPickerComponent();
const progress   = new ProgressComponent();
const result     = new ResultComponent();

dropZone.mount(document.getElementById("slot-dropzone"));
paramForm.mount(document.getElementById("slot-params"));
formatPick.mount(document.getElementById("slot-format"));

const formSection  = document.getElementById("formSection");
const progressSlot = document.getElementById("slot-progress");
const resultSlot   = document.getElementById("slot-result");
const convertBtn   = document.getElementById("convertBtn");

// ── State ────────────────────────────────────────────────────────
let selectedFile    = null;
let selectedFormat  = "mp3";
let pollingInterval = null;
let audioPlayer     = null;

// ── EventBus listeners ───────────────────────────────────────────
bus.on("file:selected", (file) => {
  selectedFile = file;
  convertBtn.disabled = false;
});

bus.on("format:changed", (fmt) => { selectedFormat = fmt; });

bus.on("app:reset", () => {
  clearInterval(pollingInterval);
  if (audioPlayer) { audioPlayer.unmount(); audioPlayer = null; }
  result.unmount();
  progress.unmount();
  selectedFile = null;
  convertBtn.disabled = true;

  dropZone.update({ filename: null });
  paramForm.reset();
  formatPick.update({ selected: "mp3" });

  progressSlot.innerHTML = "";
  resultSlot.innerHTML   = "";
  formSection.style.display = "flex";
});

// ── Convert button ───────────────────────────────────────────────
convertBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  formSection.style.display = "none";
  progress.mount(progressSlot);

  try {
    const params = paramForm.getValues();
    const jobId  = await converter.startConversion(selectedFile, selectedFormat, params);
    pollStatus(jobId);
  } catch (err) {
    progress.unmount();
    showError(err.message);
  }
});

// ── Job polling ──────────────────────────────────────────────────
function pollStatus(jobId) {
  pollingInterval = setInterval(async () => {
    try {
      const status = await converter.getStatus(jobId);
      progress.setProgress(status.progress, status.step);

      if (status.status === "done") {
        clearInterval(pollingInterval);
        progress.unmount();
        progressSlot.innerHTML = "";

        // Fetch result metadata from status
        const downloadUrl = converter.getDownloadUrl(jobId);

        result.update({
          downloadUrl,
          filename : `8d_audio.${selectedFormat}`,
          format   : selectedFormat.toUpperCase(),
          sizeMb   : 0,
          elapsed  : 0,
        });
        result.mount(resultSlot);

        // Mount audio player into result's slot
        audioPlayer = new AudioPlayerComponent();
        audioPlayer.mount(result.playerSlot);
        await audioPlayer.load(downloadUrl);

      } else if (status.status === "error") {
        clearInterval(pollingInterval);
        progress.unmount();
        progressSlot.innerHTML = "";
        showError(status.error || "Conversion failed.");
      }
    } catch (e) {
      clearInterval(pollingInterval);
      showError("Lost connection to server.");
    }
  }, 800);
}

function showError(message) {
  resultSlot.innerHTML = `
    <div class="card state-card state-card--error visible">
      <span class="state-card__icon">❌</span>
      <h2 class="state-card__title">Something went wrong</h2>
      <p class="state-card__sub">${message}</p>
      <button id="errRetry" class="btn btn-ghost">Try Again</button>
    </div>`;
  document.getElementById("errRetry")
    ?.addEventListener("click", () => bus.emit("app:reset"));
}
