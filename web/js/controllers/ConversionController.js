import { showView } from "../utils/viewRouter.js";

const CIRCUMFERENCE = 289;

export class ConversionController {
  constructor(refs, bus, state, converter, settingsController, resultController, waveformEditor, errorController) {
    this.refs = refs;
    this.bus = bus;
    this.state = state;
    this.converter = converter;
    this.settingsController = settingsController;
    this.resultController = resultController;
    this.waveformEditor = waveformEditor;
    this.errorController = errorController;
    this.lastStatusText = "";
  }

  init(onCancel) {
    this.refs.btnConvert.addEventListener("click", () => this.start());
    this.refs.btnCancel.addEventListener("click", onCancel);
  }

  async start() {
    if (!this.state.selectedFile || this.refs.btnConvert.disabled) return;
    this.refs.btnConvert.setAttribute("disabled", "true");
    this.refs.btnConvert.classList.add("opacity-50", "cursor-not-allowed");
    const selectedFormat = this.settingsController.getSelectedFormat();
    const trim = this.getTrimValues();
    const params = this.settingsController.getConversionParams(trim.start, trim.end);
    try {
      showView(this.refs.views, "processing");
      this.bus.emit("conversion:start");
      this.startProgressAnim("Uploading audio...");
      this.state.currentJobId = await this.converter.startConversion(this.state.selectedFile, selectedFormat, params);
      this.pollStatus(this.state.currentJobId, selectedFormat);
    } catch (error) {
      this.errorController.show(error.message, "ERR_UPLOAD");
    } finally {
      if (this.state.selectedFile) {
        this.refs.btnConvert.removeAttribute("disabled");
        this.refs.btnConvert.classList.remove("opacity-50", "cursor-not-allowed");
      }
    }
  }

  getTrimValues() {
    if (this.waveformEditor && typeof this.waveformEditor.getTrimValues === "function") {
      const values = this.waveformEditor.getTrimValues();
      if (values && values.start != null && values.end != null) {
        return values;
      }
    }
    return { start: this.state.currentTrimStart, end: this.state.currentTrimEnd };
  }

  startProgressAnim(text) {
    this.lastStatusText = text;
    this.refs.statusDetail.textContent = text;
    this.refs.statusDetail.style.opacity = "1";
    this.refs.progressCircle.style.strokeDashoffset = CIRCUMFERENCE;
  }

  updateProgressBar(pct) {
    const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
    if (this.refs.progressCircle.style.strokeDashoffset !== `${offset}px`) {
      this.refs.progressCircle.style.strokeDashoffset = offset;
    }
  }

  stopPolling() {
    if (this.state.pollingInterval !== null) {
      clearInterval(this.state.pollingInterval);
      this.state.pollingInterval = null;
    }
  }

  pollStatus(jobId, format) {
    this.state.pollingInterval = setInterval(async () => {
      try {
        const status = await this.converter.getStatus(jobId);
        this.updateProgressBar(status.progress || 0);
        const newText = status.step || "Processing...";
        if (newText !== this.lastStatusText) {
          this.lastStatusText = newText;
          this.refs.statusDetail.style.opacity = "0";
          setTimeout(() => {
            this.refs.statusDetail.textContent = newText;
            this.refs.statusDetail.style.opacity = "1";
          }, 150);
        }
        if (status.status === "done") {
          this.stopPolling();
          await this.resultController.finishServerConversion(jobId, format, this.state.selectedFile);
          showView(this.refs.views, "result");
        } else if (status.status === "error") {
          this.stopPolling();
          this.errorController.show(status.error, "ERR_CONVERT");
        }
      } catch {
        this.stopPolling();
        this.errorController.show("Connection lost", "ERR_NETWORK");
      }
    }, 800);
  }

  cleanup() {
    this.stopPolling();
    this.lastStatusText = "";
  }
}
