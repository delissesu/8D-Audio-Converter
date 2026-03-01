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
import time
import os

from tqdm import tqdm

from converter.core import convert_to_8d
from converter.printer import OutputPrinter
from converter.utils import get_output_path, SUPPORTED_OUTPUT_FORMATS, DEFAULT_PARAMS


def build_parser() -> argparse.ArgumentParser:
    # HIG: Accessibility — help text uses plain English, no emoji
    parser: argparse.ArgumentParser = argparse.ArgumentParser(
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

    # Positional arguments
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

    # Effect parameters
    fx_group = parser.add_argument_group("Effect Parameters")
    fx_group.add_argument(
        "--speed",
        "-s",
        type=float,
        default=DEFAULT_PARAMS["speed"],
        metavar="SPEED",
        help=f"Panning rotation speed in Hz (default: {DEFAULT_PARAMS['speed']}).",
    )
    fx_group.add_argument(
        "--depth",
        "-d",
        type=float,
        default=DEFAULT_PARAMS["depth"],
        metavar="DEPTH",
        help=f"Panning depth/intensity (default: {DEFAULT_PARAMS['depth']}).",
    )
    fx_group.add_argument(
        "--room",
        "-r",
        type=float,
        default=DEFAULT_PARAMS["room"],
        metavar="ROOM",
        help=f"Reverb room size (default: {DEFAULT_PARAMS['room']}).",
    )
    fx_group.add_argument(
        "--wet",
        "-w",
        type=float,
        default=DEFAULT_PARAMS["wet"],
        metavar="LEVEL",
        help=f"Reverb wet mix level (default: {DEFAULT_PARAMS['wet']}).",
    )
    fx_group.add_argument(
        "--damping",
        type=float,
        default=DEFAULT_PARAMS["damping"],
        metavar="LEVEL",
        help=f"Reverb high-frequency damping (default: {DEFAULT_PARAMS['damping']}).",
    )

    # Output options
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
        "--quiet",
        "-q",
        action="store_true",
        help="Suppress all output except errors.",
    )
    out_group.add_argument(
        "--no-color",
        "-n",
        action="store_true",
        help="Disable colored output (also auto-disabled when NO_COLOR env var is set).",
    )

    return parser


def main() -> None:
    parser: argparse.ArgumentParser = build_parser()
    args: argparse.Namespace = parser.parse_args()

    # HIG: Consistency — centralized output formatting
    printer: OutputPrinter = OutputPrinter(
        quiet=args.quiet,
        no_color=args.no_color,
    )

    # Resolve output format and path
    output_ext: str = ".wav"  # default

    if args.format is not None:
        # Explicit --format flag takes priority
        output_ext = f".{args.format}"
    elif args.output is not None:
        # Infer from output filename extension
        ext: str = os.path.splitext(args.output)[1].lower()
        if ext in SUPPORTED_OUTPUT_FORMATS:
            output_ext = ext

    output_path: str
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

    # Run pipeline
    start_time = time.time()
    try:
        if args.quiet:
            # Quiet mode: no progress bar
            convert_to_8d(
                input_path=args.input,
                output_path=output_path,
                pan_speed=args.speed,
                pan_depth=args.depth,
                room_size=args.room,
                wet_level=args.wet,
                damping=args.damping,
            )
        else:
            # Verbose mode: inject tqdm progress bar
            total_steps = 5
            with tqdm(total=total_steps, desc="Processing", unit="step") as pbar:

                def cli_callback(step_idx: int, total: int, name: str) -> None:
                    pbar.set_description(name)
                    if step_idx > 0:
                        pbar.update(1)
                    if step_idx == total - 1:
                        pbar.update(1)  # finish the bar

                convert_to_8d(
                    input_path=args.input,
                    output_path=output_path,
                    pan_speed=args.speed,
                    pan_depth=args.depth,
                    room_size=args.room,
                    wet_level=args.wet,
                    damping=args.damping,
                    progress_callback=cli_callback,
                )

        # Print result
        size_mb: float = os.path.getsize(output_path) / (1024 * 1024)
        out_ext: str = os.path.splitext(output_path)[1].upper().lstrip(".")
        elapsed: float = time.time() - start_time

        if not args.quiet:
            printer.success(
                title=output_path,
                details={
                    "Format": out_ext,
                    "Size": f"{size_mb:.2f} MB",
                    "Time": f"{elapsed:.1f}s",
                },
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
