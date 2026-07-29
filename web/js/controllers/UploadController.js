import { validateFile } from "../utils/fileValidation.js";

export class UploadController {
  constructor(refs, bus, state, fileQueue) {
    this.refs = refs;
    this.bus = bus;
    this.state = state;
    this.fileQueue = fileQueue;
  }

  init() {
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      this.refs.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    ["dragenter", "dragover"].forEach((eventName) => {
      this.refs.dropZone.addEventListener(eventName, () => this.refs.dropZone.classList.add("drop-active"));
    });
    ["dragleave", "drop"].forEach((eventName) => {
      this.refs.dropZone.addEventListener(eventName, () => this.refs.dropZone.classList.remove("drop-active"));
    });
    this.refs.dropZone.addEventListener("drop", (event) => this.handleFiles(event.dataTransfer.files));
    this.refs.audioInput.addEventListener("change", () => this.handleFiles(this.refs.audioInput.files));
  }

  handleFiles(files) {
    if (files.length > 1) {
      this.fileQueue.addFiles(files);
    } else if (files.length === 1) {
      this.handleFile(files[0]);
    }
  }

  handleFile(file) {
    const error = validateFile(file);
    if (error) {
      alert(error);
      return;
    }
    this.state.selectedFile = file;
    this.refs.dropPrimaryText.textContent = file.name;
    this.refs.dropSecondaryText.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    this.refs.dropPrimaryText.classList.add("text-accent");
    this.refs.btnConvert.removeAttribute("disabled");
    this.refs.btnConvert.classList.remove("opacity-50", "cursor-not-allowed", "bg-muted");
    this.refs.btnConvert.classList.add("bg-primary", "hover:bg-primary-hover", "shadow-lg");
    this.bus.emit("file:selected", file);
  }

  reset(previewController) {
    this.state.selectedFile = null;
    this.refs.audioInput.value = "";
    this.refs.dropPrimaryText.textContent = "Drop audio source";
    this.refs.dropSecondaryText.textContent = "MP3, WAV, FLAC, OGG, AAC, M4A";
    this.refs.dropPrimaryText.classList.remove("text-accent");
    this.refs.btnConvert.setAttribute("disabled", "true");
    this.refs.btnConvert.classList.add("opacity-50", "cursor-not-allowed", "bg-muted");
    this.refs.btnConvert.classList.remove("bg-primary", "hover:bg-primary-hover", "shadow-lg");
    previewController.teardown();
    this.bus.emit("app:reset");
  }
}
