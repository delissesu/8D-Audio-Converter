# 🎵 8D Audio Converter CLI

Convert any audio file into immersive 8D audio from the command line.

## Installation

```bash
git clone https://github.com/delissesu/8D-Audio-Converter.git
cd 8d-audio-converter
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
```

> **Requires FFmpeg** for MP3 support. Install via `brew install ffmpeg` or `choco install ffmpeg`.

## Usage

```bash
# Basic conversion
python main.py input.mp3 output_8d.wav

# Auto-generate output filename
python main.py input.mp3 --auto-output

# Custom effects
python main.py input.mp3 out.wav --speed 0.2 --room 0.6 --wet 0.35

# Silent mode
python main.py input.mp3 out.wav --quiet
```

## Parameters

| Flag | Default | Range | Description |
|---|---|---|---|
| `--speed` | 0.15 | 0.01–2.0 | Panning rotation speed (Hz) |
| `--depth` | 1.0 | 0.0–1.0 | Panning intensity |
| `--room` | 0.4 | 0.0–1.0 | Reverb room size |
| `--wet` | 0.3 | 0.0–1.0 | Reverb wet mix |
| `--damping` | 0.5 | 0.0–1.0 | Reverb HF damping |

## Running Tests

```bash
pip install pytest
pytest tests/ -v
```
