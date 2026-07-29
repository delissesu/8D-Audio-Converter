export function updateSliderTrack(slider, track) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  track.style.width = `${pct}%`;
}

export function formatTime(sec) {
  if (Number.isNaN(sec)) return "00:00";
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
