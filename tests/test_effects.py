import os
import tempfile

import numpy as np
import pytest
import soundfile as sf

from converter.effects import apply_panning, apply_reverb, normalize_audio
from converter.utils import (
    validate_input_file,
    validate_output_path,
    validate_param_range,
    get_output_path,
    get_export_format,
    SUPPORTED_INPUT_FORMATS,
    SUPPORTED_OUTPUT_FORMATS,
    FORMAT_EXPORT_MAP,
)
from converter.core import convert_to_8d
from converter.printer import OutputPrinter

# Test Constants
SAMPLE_RATE: int = 44100


# Helpers


def make_stereo_sine(freq: int = 440, duration: int = 2, sr: int = 44100) -> np.ndarray:
    """Create a stereo sine wave test signal."""
    t: np.ndarray = np.linspace(0, duration, sr * duration, dtype=np.float32)
    mono: np.ndarray = np.sin(2 * np.pi * freq * t).astype(np.float32)
    return np.column_stack([mono, mono])


def make_test_wav(path: str, duration: float = 0.5, sr: int = 44100) -> None:
    """Write a short stereo WAV file for integration tests."""
    num_frames: int = int(sr * duration)
    t: np.ndarray = np.linspace(0, duration, num_frames, dtype=np.float32)
    mono: np.ndarray = np.sin(2 * np.pi * 440 * t).astype(np.float32)
    stereo: np.ndarray = np.column_stack([mono, mono])
    sf.write(path, stereo, sr, subtype="PCM_16")


class TestApplyPanning:
    """Tests for sinusoidal auto-panning DSP."""

    def test_output_shape_preserved(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_panning(samples, SAMPLE_RATE)
        assert result.shape == samples.shape

    def test_output_dtype_float32(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_panning(samples, SAMPLE_RATE)
        assert result.dtype == np.float32

    def test_channels_differ_after_panning(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_panning(samples, SAMPLE_RATE)
        # After panning, left and right channels must differ
        assert not np.allclose(result[:, 0], result[:, 1])

    def test_zero_depth_produces_center(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_panning(samples, SAMPLE_RATE, pan_depth=0.0)
        # At depth=0, both channels should be equal (center pan)
        np.testing.assert_allclose(result[:, 0], result[:, 1], rtol=1e-5)

    def test_does_not_mutate_input(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        original: np.ndarray = samples.copy()
        apply_panning(samples, SAMPLE_RATE)
        np.testing.assert_array_equal(samples, original)

    def test_constant_power_law(self) -> None:
        """L^2 + R^2 should stay near 1.0 at every frame (constant power)."""
        samples: np.ndarray = np.ones((SAMPLE_RATE, 2), dtype=np.float32)
        result: np.ndarray = apply_panning(samples, SAMPLE_RATE, pan_depth=1.0)
        power: np.ndarray = result[:, 0] ** 2 + result[:, 1] ** 2
        np.testing.assert_allclose(power, 1.0, atol=1e-5)

    def test_short_audio_under_one_second(self) -> None:
        """Panning should work even for very short clips (<1s)."""
        short_samples: np.ndarray = make_stereo_sine(duration=1, sr=4410)
        result: np.ndarray = apply_panning(short_samples, 4410, pan_speed=0.5)
        assert result.shape == short_samples.shape

    def test_higher_speed_creates_more_variation(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        slow: np.ndarray = apply_panning(samples, SAMPLE_RATE, pan_speed=0.05)
        fast: np.ndarray = apply_panning(samples, SAMPLE_RATE, pan_speed=1.0)
        # Faster speed → more channel difference variance
        slow_diff: float = float(np.std(slow[:, 0] - slow[:, 1]))
        fast_diff: float = float(np.std(fast[:, 0] - fast[:, 1]))
        assert fast_diff > slow_diff

    def test_half_depth_less_extreme_than_full(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        full: np.ndarray = apply_panning(samples, SAMPLE_RATE, pan_depth=1.0)
        half: np.ndarray = apply_panning(samples, SAMPLE_RATE, pan_depth=0.5)
        full_range: float = float(np.max(np.abs(full[:, 0] - full[:, 1])))
        half_range: float = float(np.max(np.abs(half[:, 0] - half[:, 1])))
        assert half_range < full_range


class TestApplyReverb:
    """Tests for pedalboard reverb effect."""

    def test_output_shape_preserved(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_reverb(samples, SAMPLE_RATE)
        assert result.shape == samples.shape

    def test_output_dtype_float32(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_reverb(samples, SAMPLE_RATE)
        assert result.dtype == np.float32

    def test_output_differs_from_input(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_reverb(samples, SAMPLE_RATE, wet_level=0.5)
        assert not np.allclose(result, samples)

    def test_zero_wet_mostly_preserves_input(self) -> None:
        """With wet=0.0, output should be close to dry input (reverb engine may add minor gain)."""
        samples: np.ndarray = make_stereo_sine()
        result: np.ndarray = apply_reverb(samples, SAMPLE_RATE, wet_level=0.0)
        # Reverb with wet=0 still runs the dry path through the engine,
        # so we check correlation rather than exact equality
        corr_left: float = float(np.corrcoef(samples[:, 0], result[:, 0])[0, 1])
        corr_right: float = float(np.corrcoef(samples[:, 1], result[:, 1])[0, 1])
        assert corr_left > 0.99
        assert corr_right > 0.99

    def test_higher_room_size_differs_from_lower(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        small: np.ndarray = apply_reverb(samples, SAMPLE_RATE, room_size=0.1)
        large: np.ndarray = apply_reverb(samples, SAMPLE_RATE, room_size=0.9)
        assert not np.allclose(small, large)

    def test_does_not_mutate_input(self) -> None:
        samples: np.ndarray = make_stereo_sine()
        original: np.ndarray = samples.copy()
        apply_reverb(samples, SAMPLE_RATE)
        np.testing.assert_array_equal(samples, original)


class TestNormalizeAudio:
    """Tests for peak normalization."""

    def test_peak_is_near_099(self) -> None:
        samples: np.ndarray = make_stereo_sine() * 5.0  # Overdriven signal
        result: np.ndarray = normalize_audio(samples)
        assert np.max(np.abs(result)) == pytest.approx(0.99, abs=1e-4)

    def test_silent_audio_unchanged(self) -> None:
        samples: np.ndarray = np.zeros((1000, 2), dtype=np.float32)
        result: np.ndarray = normalize_audio(samples)
        np.testing.assert_array_equal(result, samples)

    def test_already_normalized_audio(self) -> None:
        """Audio already peaking at 0.99 should stay the same."""
        samples: np.ndarray = make_stereo_sine() * 0.99
        result: np.ndarray = normalize_audio(samples)
        assert np.max(np.abs(result)) == pytest.approx(0.99, abs=1e-4)

    def test_quiet_audio_is_scaled_up(self) -> None:
        """Very quiet audio should be boosted to 0.99 peak."""
        samples: np.ndarray = make_stereo_sine() * 0.01
        result: np.ndarray = normalize_audio(samples)
        assert np.max(np.abs(result)) == pytest.approx(0.99, abs=1e-4)

    def test_preserves_shape(self) -> None:
        samples: np.ndarray = make_stereo_sine() * 3.0
        result: np.ndarray = normalize_audio(samples)
        assert result.shape == samples.shape

    def test_negative_peak_handled(self) -> None:
        """Audio with negative-only values should normalize correctly."""
        samples: np.ndarray = -np.abs(make_stereo_sine()) * 4.0
        result: np.ndarray = normalize_audio(samples)
        assert np.max(np.abs(result)) == pytest.approx(0.99, abs=1e-4)


class TestValidateInputFile:
    """Tests for input file validation."""

    def test_nonexistent_file_raises_file_not_found(self) -> None:
        with pytest.raises(FileNotFoundError, match="Input file not found"):
            validate_input_file("absolutely_missing_file.mp3")

    def test_directory_instead_of_file_raises_value_error(self, tmp_path: str) -> None:
        with pytest.raises(ValueError, match="not a file"):
            validate_input_file(str(tmp_path))

    def test_unsupported_extension_raises_value_error(self, tmp_path: str) -> None:
        bad_file: str = os.path.join(str(tmp_path), "song.txt")
        with open(bad_file, "w") as f:
            f.write("not audio")
        with pytest.raises(ValueError, match="Unsupported input format"):
            validate_input_file(bad_file)

    def test_valid_wav_file_passes(self, tmp_path: str) -> None:
        wav_file: str = os.path.join(str(tmp_path), "test.wav")
        make_test_wav(wav_file)
        validate_input_file(wav_file)  # Should not raise

    def test_all_supported_extensions_recognized(self) -> None:
        """Ensure the format set contains the documented formats."""
        expected: set[str] = {".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a"}
        assert SUPPORTED_INPUT_FORMATS == expected


class TestValidateOutputPath:
    """Tests for output path validation."""

    def test_unsupported_extension_raises(self) -> None:
        with pytest.raises(ValueError, match="Unsupported output format"):
            validate_output_path("output.txt")

    def test_missing_output_directory_raises(self) -> None:
        with pytest.raises(FileNotFoundError, match="Output directory does not exist"):
            validate_output_path("/nonexistent/dir/output.wav")

    def test_valid_output_in_cwd_passes(self, tmp_path: str) -> None:
        out: str = os.path.join(str(tmp_path), "output.wav")
        validate_output_path(out)  # Should not raise

    def test_mp3_output_accepted(self, tmp_path: str) -> None:
        out: str = os.path.join(str(tmp_path), "output.mp3")
        validate_output_path(out)  # Should not raise with HIG multi-format

    def test_all_supported_output_formats(self) -> None:
        expected: set[str] = {".mp3", ".wav", ".flac", ".ogg", ".m4a"}
        assert SUPPORTED_OUTPUT_FORMATS == expected


class TestValidateParamRange:
    """Tests for numeric parameter range checking."""

    def test_valid_range_passes(self) -> None:
        validate_param_range(0.5, "test", 0.0, 1.0)  # Should not raise

    def test_out_of_range_raises(self) -> None:
        with pytest.raises(ValueError):
            validate_param_range(1.5, "test", 0.0, 1.0)

    def test_below_minimum_raises(self) -> None:
        with pytest.raises(ValueError, match="must be between"):
            validate_param_range(-0.1, "pan_depth", 0.0, 1.0)

    def test_at_exact_minimum_passes(self) -> None:
        validate_param_range(0.0, "pan_depth", 0.0, 1.0)  # Should not raise

    def test_at_exact_maximum_passes(self) -> None:
        validate_param_range(1.0, "pan_depth", 0.0, 1.0)  # Should not raise

    def test_error_message_includes_param_name(self) -> None:
        with pytest.raises(ValueError, match="pan_speed"):
            validate_param_range(5.0, "pan_speed", 0.01, 2.0)


class TestGetOutputPath:
    """Tests for auto-generated output path."""

    def test_mp3_becomes_wav(self) -> None:
        result: str = get_output_path("music/song.mp3")
        assert result == "music/song_8d.wav"

    def test_custom_suffix(self) -> None:
        result: str = get_output_path("song.flac", suffix="_converted")
        assert result.endswith("_converted.wav")

    def test_wav_input_becomes_8d_wav(self) -> None:
        result: str = get_output_path("track.wav")
        assert result == "track_8d.wav"

    def test_nested_path_preserved(self) -> None:
        result: str = get_output_path("a/b/c/deep.ogg")
        assert result == "a/b/c/deep_8d.wav"

    def test_default_suffix_is_8d(self) -> None:
        result: str = get_output_path("x.mp3")
        assert "_8d" in result

    def test_output_ext_override_to_mp3(self) -> None:
        result: str = get_output_path("song.wav", output_ext=".mp3")
        assert result == "song_8d.mp3"

    def test_output_ext_override_to_flac(self) -> None:
        result: str = get_output_path("song.wav", output_ext=".flac")
        assert result == "song_8d.flac"


class TestGetExportFormat:
    """Tests for pydub export format mapping."""

    def test_wav_returns_wav(self) -> None:
        assert get_export_format("output.wav") == "wav"

    def test_mp3_returns_mp3(self) -> None:
        assert get_export_format("output.mp3") == "mp3"

    def test_m4a_returns_mp4(self) -> None:
        assert get_export_format("output.m4a") == "mp4"

    def test_flac_returns_flac(self) -> None:
        assert get_export_format("output.flac") == "flac"

    def test_ogg_returns_ogg(self) -> None:
        assert get_export_format("output.ogg") == "ogg"

    def test_unknown_defaults_to_wav(self) -> None:
        assert get_export_format("output.xyz") == "wav"

    def test_all_formats_in_map(self) -> None:
        for ext in SUPPORTED_OUTPUT_FORMATS:
            assert ext in FORMAT_EXPORT_MAP


class TestConvertTo8D:
    """Integration tests for the full DSP pipeline."""

    def test_end_to_end_wav_conversion(self, tmp_path: str) -> None:
        """Full pipeline: WAV in → 8D WAV out."""
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_path: str = os.path.join(str(tmp_path), "output_8d.wav")
        make_test_wav(in_path, duration=0.5)

        convert_to_8d(
            input_path=in_path,
            output_path=out_path,
            verbose=False,
        )

        assert os.path.exists(out_path)
        data: np.ndarray
        sr: int
        data, sr = sf.read(out_path)
        assert data.ndim == 2  # stereo
        assert data.shape[1] == 2  # two channels
        assert sr == 44100

    def test_output_is_stereo(self, tmp_path: str) -> None:
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_path: str = os.path.join(str(tmp_path), "out.wav")
        make_test_wav(in_path)
        convert_to_8d(in_path, out_path, verbose=False)
        data, _ = sf.read(out_path)
        assert data.shape[1] == 2

    def test_output_peak_not_clipped(self, tmp_path: str) -> None:
        """Output should be normalized and not exceed 1.0."""
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_path: str = os.path.join(str(tmp_path), "out.wav")
        make_test_wav(in_path)
        convert_to_8d(in_path, out_path, verbose=False)
        data, _ = sf.read(out_path, dtype="float32")
        assert np.max(np.abs(data)) <= 1.0

    def test_output_differs_from_input(self, tmp_path: str) -> None:
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_path: str = os.path.join(str(tmp_path), "out.wav")
        make_test_wav(in_path)
        convert_to_8d(in_path, out_path, verbose=False)
        original, _ = sf.read(in_path, dtype="float32")
        processed, _ = sf.read(out_path, dtype="float32")
        assert not np.allclose(original, processed)

    def test_missing_input_raises_file_not_found(self, tmp_path: str) -> None:
        out_path: str = os.path.join(str(tmp_path), "out.wav")
        with pytest.raises(FileNotFoundError):
            convert_to_8d("nonexistent.wav", out_path, verbose=False)

    def test_invalid_output_extension_raises(self, tmp_path: str) -> None:
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        make_test_wav(in_path)
        with pytest.raises(ValueError, match="Unsupported output format"):
            convert_to_8d(in_path, "output.txt", verbose=False)

    def test_pan_speed_out_of_range_raises(self, tmp_path: str) -> None:
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_path: str = os.path.join(str(tmp_path), "out.wav")
        make_test_wav(in_path)
        with pytest.raises(ValueError, match="pan_speed"):
            convert_to_8d(in_path, out_path, pan_speed=99.0, verbose=False)

    def test_room_size_out_of_range_raises(self, tmp_path: str) -> None:
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_path: str = os.path.join(str(tmp_path), "out.wav")
        make_test_wav(in_path)
        with pytest.raises(ValueError, match="room_size"):
            convert_to_8d(in_path, out_path, room_size=1.5, verbose=False)

    def test_temp_file_cleaned_up(self, tmp_path: str) -> None:
        """The temp WAV created during loading must not remain on disk."""
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_path: str = os.path.join(str(tmp_path), "out.wav")
        make_test_wav(in_path)

        temp_dir: str = tempfile.gettempdir()
        before: set[str] = set(os.listdir(temp_dir))
        convert_to_8d(in_path, out_path, verbose=False)
        after: set[str] = set(os.listdir(temp_dir))
        # No new leftover temp files with .wav extension
        new_files: set[str] = after - before
        wav_leftovers: list[str] = [f for f in new_files if f.endswith(".wav")]
        assert len(wav_leftovers) == 0

    def test_custom_params_produce_different_output(self, tmp_path: str) -> None:
        """Different effect params should produce different results."""
        in_path: str = os.path.join(str(tmp_path), "input.wav")
        out_a: str = os.path.join(str(tmp_path), "a.wav")
        out_b: str = os.path.join(str(tmp_path), "b.wav")
        make_test_wav(in_path)

        convert_to_8d(in_path, out_a, pan_speed=0.1, room_size=0.2, verbose=False)
        convert_to_8d(in_path, out_b, pan_speed=0.8, room_size=0.9, verbose=False)

        data_a, _ = sf.read(out_a, dtype="float32")
        data_b, _ = sf.read(out_b, dtype="float32")
        assert not np.allclose(data_a, data_b)


class TestOutputPrinter:
    """Tests for HIG-compliant OutputPrinter."""

    def test_success_prints_to_stdout(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=True)
        printer.success("song_8d.wav", details={"Format": "WAV", "Size": "4.21 MB"})
        captured = capsys.readouterr()
        assert "song_8d.wav" in captured.out
        assert "Format" in captured.out
        assert "4.21 MB" in captured.out

    def test_error_prints_to_stderr(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=True)
        printer.error("File not found.", hint="Check the path.")
        captured = capsys.readouterr()
        assert "File not found." in captured.err
        assert "Check the path." in captured.err
        assert captured.out == ""  # Nothing on stdout

    def test_warning_prints_with_hint(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=True)
        printer.warning("FFmpeg not found.", hint="Install FFmpeg.")
        captured = capsys.readouterr()
        assert "FFmpeg not found." in captured.out
        assert "Install FFmpeg." in captured.out

    def test_info_prints_message(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=True)
        printer.info("Processing complete.")
        captured = capsys.readouterr()
        assert "Processing complete." in captured.out

    def test_quiet_suppresses_success(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(quiet=True)
        printer.success("output.wav", details={"Format": "WAV"})
        captured = capsys.readouterr()
        assert captured.out == ""

    def test_quiet_suppresses_warning(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(quiet=True)
        printer.warning("Some warning.")
        captured = capsys.readouterr()
        assert captured.out == ""

    def test_quiet_suppresses_info(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(quiet=True)
        printer.info("Some info.")
        captured = capsys.readouterr()
        assert captured.out == ""

    def test_quiet_does_not_suppress_error(self, capsys) -> None:
        """Errors must always reach the user, even in quiet mode."""
        printer: OutputPrinter = OutputPrinter(quiet=True, no_color=True)
        printer.error("Critical failure.")
        captured = capsys.readouterr()
        assert "Critical failure." in captured.err

    def test_no_color_disables_ansi(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=True)
        printer.success("test.wav")
        captured = capsys.readouterr()
        assert "\033[" not in captured.out

    def test_color_enabled_includes_ansi(self, capsys) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=False)
        printer.success("test.wav")
        captured = capsys.readouterr()
        assert "\033[" in captured.out

    def test_no_color_env_variable(self, monkeypatch) -> None:
        """NO_COLOR env var should auto-disable color."""
        monkeypatch.setenv("NO_COLOR", "1")
        printer: OutputPrinter = OutputPrinter()
        assert printer.no_color is True

    def test_colorize_returns_plain_when_no_color(self) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=True)
        result: str = printer._colorize("hello", "32")
        assert result == "hello"
        assert "\033[" not in result

    def test_colorize_returns_ansi_when_color_enabled(self) -> None:
        printer: OutputPrinter = OutputPrinter(no_color=False)
        result: str = printer._colorize("hello", "32")
        assert result == "\033[32mhello\033[0m"

    def test_success_detail_column_alignment(self, capsys) -> None:
        """Detail keys should be padded to COL_WIDTH for alignment."""
        printer: OutputPrinter = OutputPrinter(no_color=True)
        printer.success("out.wav", details={"Format": "WAV", "Size": "1 MB"})
        captured = capsys.readouterr()
        # Keys are padded to 10 chars
        assert "Format    " in captured.out
        assert "Size      " in captured.out
