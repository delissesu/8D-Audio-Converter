import { updateSliderTrack } from "../utils/sliders.js";

export class SettingsController {
  constructor(refs, bus) {
    this.refs = refs;
    this.bus = bus;
  }

  init(onChange) {
    this.bindSlider(this.refs.speedSlider, this.refs.speedVal, this.refs.speedTrack, (value) => `${parseFloat(value).toFixed(1)}s`, onChange);
    this.bindSlider(this.refs.reverbSlider, this.refs.reverbVal, this.refs.reverbTrack, (value) => `${value}%`, onChange);
    this.bindSlider(this.refs.crossfeedSlider, this.refs.crossfeedVal, this.refs.crossfeedTrack, (value) => `${value}%`, onChange);
    this.bindSlider(this.refs.depthSlider, this.refs.depthVal, this.refs.depthTrack, (value) => `${value}%`, onChange);
    this.bindSlider(this.refs.dampingSlider, this.refs.dampingVal, this.refs.dampingTrack, (value) => `${value}%`, onChange);
    this.refreshTracks();
    this.bus.on("preset:loaded", (params) => this.applyPreset(params));
    this.bus.on("preset:request-params", () => {
      this.bus.emit("preset:request-params-response", this.getCurrentParams());
    });
  }

  bindSlider(slider, valueNode, track, formatter, onChange) {
    slider.addEventListener("input", () => {
      valueNode.textContent = formatter(slider.value);
      updateSliderTrack(slider, track);
      onChange();
    });
  }

  refreshTracks() {
    updateSliderTrack(this.refs.speedSlider, this.refs.speedTrack);
    updateSliderTrack(this.refs.reverbSlider, this.refs.reverbTrack);
    updateSliderTrack(this.refs.crossfeedSlider, this.refs.crossfeedTrack);
    updateSliderTrack(this.refs.depthSlider, this.refs.depthTrack);
    updateSliderTrack(this.refs.dampingSlider, this.refs.dampingTrack);
  }

  getCurrentParams() {
    const speedSeconds = parseFloat(this.refs.speedSlider.value);
    return {
      pan_speed: Math.min(2.0, Math.max(0.01, 1.0 / speedSeconds)),
      pan_depth: this.refs.depthSlider.value / 100,
      room_size: this.refs.reverbSlider.value / 100,
      wet_level: this.refs.crossfeedSlider.value / 100,
      damping: this.refs.dampingSlider.value / 100,
    };
  }

  getSelectedFormat() {
    let selectedFormat = "mp3";
    this.refs.formatRadios.forEach((radio) => {
      if (radio.checked) selectedFormat = radio.value;
    });
    return selectedFormat;
  }

  getConversionParams(trimStart, trimEnd) {
    const params = this.getCurrentParams();
    return {
      speed: params.pan_speed,
      room: params.room_size,
      depth: params.pan_depth,
      wet: params.wet_level,
      damping: params.damping,
      trim_start: String(trimStart),
      trim_end: String(trimEnd),
    };
  }

  applyPreset(params) {
    const seconds = Math.min(10, Math.max(1, Math.round((1.0 / params.pan_speed) * 2) / 2));
    this.refs.speedSlider.value = seconds;
    this.refs.speedVal.textContent = `${parseFloat(seconds).toFixed(1)}s`;
    this.refs.depthSlider.value = Math.round(params.pan_depth * 100);
    this.refs.depthVal.textContent = `${this.refs.depthSlider.value}%`;
    this.refs.reverbSlider.value = Math.round(params.room_size * 100);
    this.refs.reverbVal.textContent = `${this.refs.reverbSlider.value}%`;
    this.refs.crossfeedSlider.value = Math.round(params.wet_level * 100);
    this.refs.crossfeedVal.textContent = `${this.refs.crossfeedSlider.value}%`;
    this.refs.dampingSlider.value = Math.round(params.damping * 100);
    this.refs.dampingVal.textContent = `${this.refs.dampingSlider.value}%`;
    this.refreshTracks();
  }
}
