export class PreviewController {
  constructor(bus, state, realtimePreview, previewToggle, waveformEditor, settingsController) {
    this.bus = bus;
    this.state = state;
    this.realtimePreview = realtimePreview;
    this.previewToggle = previewToggle;
    this.waveformEditor = waveformEditor;
    this.settingsController = settingsController;
  }

  init() {
    this.bus.on("preview:start", async () => {
      if (!this.state.selectedFile) return;
      try {
        const trim = this.waveformEditor?.getTrimValues() ?? { start: 0, end: 0 };
        await this.realtimePreview.loadExcerpt(this.state.selectedFile, trim);
        this.bus.emit("preview:loaded");
        await this.realtimePreview.play(this.settingsController.getCurrentParams());
      } catch {
        this.bus.emit("preview:error");
      }
    });
    this.bus.on("preview:stop", () => this.realtimePreview.stop());
    this.bus.on("conversion:start", () => {
      this.realtimePreview.stop();
      this.previewToggle.setInactive();
    });
  }

  updateIfPlaying() {
    if (this.realtimePreview.isPlaying) {
      this.realtimePreview.updateParams(this.settingsController.getCurrentParams());
    }
  }

  teardown() {
    this.realtimePreview.teardown();
    this.previewToggle.setInactive();
  }
}
