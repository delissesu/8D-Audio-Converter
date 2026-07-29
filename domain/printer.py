

import os
import sys
from typing import Optional

class OutputPrinter:

    SYMBOLS: dict[str, str] = {
        "success": "✅",
        "error": "❌",
        "warning": "⚠️ ",
        "info": "ℹ️ ",
        "hint": "→",
    }

    COLORS: dict[str, str] = {
        "green": "32",
        "red": "31",
        "yellow": "33",
        "cyan": "36",
        "dim": "90",
    }

    COL_WIDTH: int = 10

    def __init__(self, quiet: bool = False, no_color: bool = False) -> None:
        self.quiet: bool = quiet
        self.no_color: bool = no_color or bool(os.environ.get("NO_COLOR", ""))

    def _colorize(self, text: str, code: str) -> str:

        if self.no_color:
            return text
        return f"\033[{code}m{text}\033[0m"

    def success(self, title: str, details: Optional[dict[str, str]] = None) -> None:

        if self.quiet:
            return
        symbol: str = self._colorize(self.SYMBOLS["success"], self.COLORS["green"])
        label: str = self._colorize(title, self.COLORS["green"])
        print(f"\n{symbol}  {label}")
        if details:
            for key, value in details.items():
                dim_key: str = self._colorize(
                    f"{key:<{self.COL_WIDTH}}", self.COLORS["dim"]
                )
                print(f"    {dim_key}: {value}")

    def error(self, message: str, hint: Optional[str] = None) -> None:

        symbol: str = self._colorize(self.SYMBOLS["error"], self.COLORS["red"])
        msg: str = self._colorize(message, self.COLORS["red"])
        print(f"\n{symbol}  {msg}", file=sys.stderr)
        if hint:
            h: str = self._colorize(
                f"{self.SYMBOLS['hint']} {hint}", self.COLORS["cyan"]
            )
            print(f"    {h}", file=sys.stderr)

    def warning(self, message: str, hint: Optional[str] = None) -> None:

        if self.quiet:
            return
        symbol: str = self._colorize(self.SYMBOLS["warning"], self.COLORS["yellow"])
        msg: str = self._colorize(message, self.COLORS["yellow"])
        print(f"\n{symbol} {msg}")
        if hint:
            h: str = self._colorize(
                f"{self.SYMBOLS['hint']} {hint}", self.COLORS["cyan"]
            )
            print(f"    {h}")

    def info(self, message: str) -> None:

        if self.quiet:
            return
        symbol: str = self._colorize(self.SYMBOLS["info"], self.COLORS["cyan"])
        print(f"{symbol} {message}")
