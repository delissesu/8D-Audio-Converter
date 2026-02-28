#!/usr/bin/env python3
"""
8D Audio Converter CLI
Convert any audio file to an immersive 8D audio experience.

Usage:
    python main.py input.mp3 output_8d.wav
    python main.py input.mp3 output_8d.wav --speed 0.2 --room 0.5
    python main.py input.mp3 --auto-output
    python main.py input.mp3 --auto-output --format mp3
"""

import argparse
import sys

from converter.core import convert_to_8d
from converter.printer import OutputPrinter
from converter.utils import get_output_path, SUPPORTED_OUTPUT_FORMATS


def build_parser() -> argparse.ArgumentParser:
    # HIG: Accessibility — help text uses plain English, no emoji
    parser : argparse.ArgumentParser = argparse.ArgumentParser(
        prog="8d-converter",
        description="Convert audio files to immersive 8D audio.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py song.mp3 song_8d.wav
  python main.py song.mp3 song_8d.mp3 --speed 0.25 --room 0.6
  python main.py song.mp3 --auto-output --format mp3 --quiet

Parameter guide:
  --speed   0.05 = slow rotation | 0.15 = natural | 0.5 = fast spin
  --depth   0.5  = subtle pan    | 1.0  = full L-R sweep
  --room    0.2  = small room    | 0.7  = concert hall
  --wet     0.1  = dry           | 0.4  = wet/reverb-heavy
  --damping 0.2  = bright reverb | 0.8  = warm/dark reverb
        """,
    )

    # ── Positional arguments ─────────────────────────────────────
    parser.add_argument(
        "input",
        metavar="INPUT",
        help="Path to the input audio file (.mp3, .wav, .flac, .ogg, .aac, .m4a).",
    )
    parser.add_argument(
        "output",
        metavar="OUTPUT",
        nargs="?",
        default=None,
        help="Path for the output file. Omit if using --auto-output.",
    )

    # ── Effect parameters ────────────────────────────────────────
    # HIG: Clarity — full-word flags, self-describing names
    fx_group = parser.add_argument_group("Effect Parameters")
    fx_group.add_argument(
        "--speed", "-s",
        type=float,
        default=0.15,
        metavar="SPEED",
        help="Panning rotation speed in Hz (default: 0.15).",
    )
    fx_group.add_argument(
        "--depth", "-d",
        type=float,
        default=1.0,
        metavar="DEPTH",
        help="Panning depth/intensity (default: 1.0).",
    )
    fx_group.add_argument(
        "--room", "-r",
        type=float,
        default=0.4,
        metavar="ROOM",
        help="Reverb room size (default: 0.4).",
    )
    fx_group.add_argument(
        "--wet", "-w",
        type=float,
        default=0.3,
        metavar="LEVEL",
        help="Reverb wet mix level (default: 0.3).",
    )
    fx_group.add_argument(
        "--damping",
        type=float,
        default=0.5,
        metavar="LEVEL",
        help="Reverb high-frequency damping (default: 0.5).",
    )

    # ── Output options ───────────────────────────────────────────
    out_group = parser.add_argument_group("Output Options")
    out_group.add_argument(
        "--auto-output",
        action="store_true",
        help="Auto-generate output filename from input (e.g., song.mp3 -> song_8d.wav).",
    )
    out_group.add_argument(
        "--format",
        type=str,
        default=None,
        choices=["mp3", "wav", "flac", "ogg", "m4a"],
        help="Output format (default: wav, or inferred from OUTPUT filename).",
    )
    out_group.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress all output except errors.",
    )
    out_group.add_argument(
        "--no-color", "-n",
        action="store_true",
        help="Disable colored output (also auto-disabled when NO_COLOR env var is set).",
    )

    return parser


def main() -> None:
    parser : argparse.ArgumentParser = build_parser()
    args   : argparse.Namespace = parser.parse_args()

    # HIG: Consistency — centralized output formatting
    printer : OutputPrinter = OutputPrinter(
        quiet=args.quiet,
        no_color=args.no_color,
    )

    # ── Resolve output format and path ───────────────────────────
    import os
    output_ext : str = ".wav"  # default

    if args.format is not None:
        # Explicit --format flag takes priority
        output_ext = f".{args.format}"
    elif args.output is not None:
        # Infer from output filename extension
        ext : str = os.path.splitext(args.output)[1].lower()
        if ext in SUPPORTED_OUTPUT_FORMATS:
            output_ext = ext

    output_path : str
    if args.output is None and args.auto_output:
        output_path = get_output_path(args.input, suffix="_8d", output_ext=output_ext)
    elif args.output is not None:
        output_path = args.output
        # If --format given but output has wrong extension, override
        if args.format is not None and not output_path.lower().endswith(output_ext):
            output_path = os.path.splitext(output_path)[0] + output_ext
    else:
        parser.error(
            "Provide an OUTPUT path, or use --auto-output to generate one automatically."
        )
        return  # unreachable but satisfies type checkers

    # ── Run pipeline ─────────────────────────────────────────────
    try:
        convert_to_8d(
            input_path=args.input,
            output_path=output_path,
            pan_speed=args.speed,
            pan_depth=args.depth,
            room_size=args.room,
            wet_level=args.wet,
            damping=args.damping,
            verbose=not args.quiet,
            printer=printer,
        )
    except (FileNotFoundError, ValueError) as exc:
        # HIG: Consistency — errors always to stderr via printer
        printer.error(str(exc))
        sys.exit(1)
    except KeyboardInterrupt:
        # HIG: Feedback — acknowledge cancellation, explain outcome
        printer.warning("Conversion cancelled.", hint="Output file was not saved.")
        sys.exit(130)


if __name__ == "__main__":
    main()
