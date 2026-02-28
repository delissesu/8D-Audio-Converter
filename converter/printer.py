# converter/printer.py
# HIG: Depth + Consistency — centralized output formatter
# Implements the three-tier hierarchy from Apple HIG.

import os
import sys
from typing import Optional


class OutputPrinter:
    """
    HIG-compliant output formatter for the 8D Audio Converter CLI.

    Implements Apple HIG principles:
    - Clarity:     plain language, verb-first step labels
    - Deference:   result is focal point, progress is secondary
    - Depth:       three-tier hierarchy with symbols
    - Consistency: uniform error/success/warning format
    - Accessibility: color-optional, NO_COLOR support
    """

    # HIG: Depth — symbols define hierarchy levels
    SYMBOLS : dict[str, str] = {
        "success" : "✅",
        "error"   : "❌",
        "warning" : "⚠️ ",
        "info"    : "ℹ️ ",
        "hint"    : "→",
    }

    # HIG: Color — purposeful, never sole conveyor of meaning
    COLORS : dict[str, str] = {
        "green"  : "32",
        "red"    : "31",
        "yellow" : "33",
        "cyan"   : "36",
        "dim"    : "90",
    }

    COL_WIDTH : int = 10  # Column alignment for detail blocks  # HIG: Typography

    def __init__(self, quiet : bool = False, no_color : bool = False) -> None:
        self.quiet    : bool = quiet
        self.no_color : bool = no_color or bool(os.environ.get("NO_COLOR", ""))

    # ── Internal ─────────────────────────────────────────────────

    def _colorize(self, text : str, code : str) -> str:
        """Apply ANSI color code if color output is enabled."""
        # HIG: Accessibility — color is never the only indicator
        if self.no_color:
            return text
        return f"\033[{code}m{text}\033[0m"

    # ── Level-1 outputs ──────────────────────────────────────────

    def success(self, title : str, details : Optional[dict[str, str]] = None) -> None:
        """Print a Level-1 success message with optional Level-2 detail block."""
        # HIG: Deference — result is focal point
        if self.quiet:
            return
        symbol : str = self._colorize(self.SYMBOLS["success"], self.COLORS["green"])
        label  : str = self._colorize(title, self.COLORS["green"])
        print(f"\n{symbol}  {label}")
        if details:
            for key, value in details.items():
                dim_key : str = self._colorize(f"{key:<{self.COL_WIDTH}}", self.COLORS["dim"])
                print(f"    {dim_key}: {value}")

    def error(self, message : str, hint : Optional[str] = None) -> None:
        """Print a Level-1 error to stderr with optional Level-3 fix hint."""
        # HIG: Consistency — errors always to stderr
        symbol : str = self._colorize(self.SYMBOLS["error"], self.COLORS["red"])
        msg    : str = self._colorize(message, self.COLORS["red"])
        print(f"\n{symbol}  {msg}", file=sys.stderr)
        if hint:
            h : str = self._colorize(
                f"{self.SYMBOLS['hint']} {hint}", self.COLORS["cyan"]
            )
            print(f"    {h}", file=sys.stderr)

    def warning(self, message : str, hint : Optional[str] = None) -> None:
        """Print a Level-1 warning with optional Level-3 suggestion."""
        if self.quiet:
            return
        symbol : str = self._colorize(self.SYMBOLS["warning"], self.COLORS["yellow"])
        msg    : str = self._colorize(message, self.COLORS["yellow"])
        print(f"\n{symbol} {msg}")
        if hint:
            h : str = self._colorize(
                f"{self.SYMBOLS['hint']} {hint}", self.COLORS["cyan"]
            )
            print(f"    {h}")

    def info(self, message : str) -> None:
        """Print a Level-1 informational message."""
        if self.quiet:
            return
        symbol : str = self._colorize(self.SYMBOLS["info"], self.COLORS["cyan"])
        print(f"{symbol} {message}")
