#!/usr/bin/env python3
"""
8D Audio Converter CLI
Convert any audio file to an immersive 8D audio experience.

Usage:
    python main.py input.mp3 output_8d.wav
    python main.py input.mp3 output_8d.wav --speed 0.2 --room 0.5
    python main.py input.mp3 --auto-output
"""

import argparse
import sys
from converter.core import convert_to_8d
from converter.utils import get_output_path


def build_parser() -> argparse.ArgumentParser:
    parser : argparse.ArgumentParser = argparse.ArgumentParser(
        prog="8d-converter",
        description="🎵 Convert audio files to immersive 8D audio",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py song.mp3 song_8d.wav
  python main.py song.mp3 song_8d.wav --speed 0.25 --room 0.6
  python main.py song.mp3 --auto-output --quiet

Parameter guide:
  --speed   0.05 = slow rotation | 0.15 = natural | 0.5 = fast spin
  --depth   0.5  = subtle pan    | 1.0  = full L-R sweep
  --room    0.2  = small room    | 0.7  = concert hall
  --wet     0.1  = dry           | 0.4  = wet/reverb-heavy
  --damping 0.2  = bright reverb | 0.8  = warm/dark reverb
        """,
    )

    # Positional arguments
    parser.add_argument(
        "input",
        metavar="INPUT",
        help="Path to the input audio file (.mp3, .wav, .flac, .ogg)",
    )
    parser.add_argument(
        "output",
        metavar="OUTPUT",
        nargs="?",
        default=None,
        help="Path for the 8D output file (.wav). Optional if --auto-output is set.",
    )

    # Effect Parameters
    fx_group = parser.add_argument_group("Effect Parameters")
    fx_group.add_argument(
        "--speed", "-s",
        type=float,
        default=0.15,
        metavar="HZ",
        help="Panning rotation speed in Hz (default: 0.15)",
    )
    fx_group.add_argument(
        "--depth", "-d",
        type=float,
        default=1.0,
        metavar="0.0-1.0",
        help="Panning depth/intensity (default: 1.0)",
    )
    fx_group.add_argument(
        "--room", "-r",
        type=float,
        default=0.4,
        metavar="0.0-1.0",
        help="Reverb room size (default: 0.4)",
    )
    fx_group.add_argument(
        "--wet", "-w",
        type=float,
        default=0.3,
        metavar="0.0-1.0",
        help="Reverb wet mix level (default: 0.3)",
    )
    fx_group.add_argument(
        "--damping",
        type=float,
        default=0.5,
        metavar="0.0-1.0",
        help="Reverb high-frequency damping (default: 0.5)",
    )

    # Output Options
    out_group = parser.add_argument_group("Output Options")
    out_group.add_argument(
        "--auto-output",
        action="store_true",
        help="Auto-generate output filename from input (e.g., song.mp3 -> song_8d.wav)",
    )
    out_group.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Suppress progress output",
    )

    return parser


def main() -> None:
    parser : argparse.ArgumentParser = build_parser()
    args : argparse.Namespace = parser.parse_args()

    # Resolve output path
    output_path : str
    if args.output is None and args.auto_output:
        output_path = get_output_path(args.input)
    elif args.output is not None:
        output_path = args.output
    else:
        parser.error(
            "Provide an OUTPUT path, or use --auto-output to generate one automatically."
        )
        return  # unreachable but satisfies type checkers

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
        )
    except (FileNotFoundError, ValueError) as e:
        print(f"\n❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️  Conversion cancelled.", file=sys.stderr)
        sys.exit(130)


if __name__ == "__main__":
    main()
