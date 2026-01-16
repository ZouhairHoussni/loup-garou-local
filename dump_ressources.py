#!/usr/bin/env python3
"""
Dump selected source files into one .txt file.

- Recursively crawls a folder
- Includes only: .py, .css, .html, .js
- Writes: a header with the relative path, then the file content
- Tries UTF-8 first; falls back to latin-1; replaces undecodable chars
- Skips common noisy folders (venv, node_modules, .git, __pycache__, etc.)
"""

from __future__ import annotations
from pathlib import Path
import argparse

DEFAULT_EXTS = {".py", ".css", ".html", ".js"}
DEFAULT_EXCLUDE_DIRS = {
    ".git", ".hg", ".svn",
    "__pycache__", ".pytest_cache",
    ".mypy_cache", ".ruff_cache",
    "venv", ".venv", "env", ".env",
    "node_modules", "dist", "build", ".next", ".nuxt",
    ".idea", ".vscode",
}

SEPARATOR = "\n" + ("=" * 100) + "\n"


def should_skip_dir(dir_path: Path, exclude_names: set[str]) -> bool:
    return dir_path.name in exclude_names


def read_text_safely(p: Path) -> str:
    # Try UTF-8, then latin-1; finally replace errors with UTF-8.
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return p.read_text(encoding=enc)
        except UnicodeDecodeError:
            continue
        except Exception as e:
            return f"<<ERROR reading file: {e}>>"
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"<<ERROR reading file: {e}>>"


def crawl_and_dump(root: Path, out_file: Path, exts: set[str], exclude_dirs: set[str]) -> tuple[int, int]:
    root = root.resolve()
    out_file = out_file.resolve()

    # Collect files first (sorted for stable output)
    files: list[Path] = []

    for path in root.rglob("*"):
        if path.is_dir():
            if should_skip_dir(path, exclude_dirs):
                # Don't descend into excluded dirs: rglob doesn't support prune directly,
                # but we can skip collecting anything inside by ignoring later.
                continue

        if path.is_file() and path.suffix.lower() in exts:
            # Skip if any parent directory is excluded
            if any(parent.name in exclude_dirs for parent in path.parents):
                continue
            files.append(path)

    files.sort(key=lambda p: str(p).lower())

    total_files = 0
    total_bytes = 0

    with out_file.open("w", encoding="utf-8", newline="\n") as f:
        f.write(f"ROOT: {root}\n")
        f.write(f"EXTENSIONS: {', '.join(sorted(exts))}\n")
        f.write(f"EXCLUDED DIRS: {', '.join(sorted(exclude_dirs))}\n")
        f.write(SEPARATOR)

        for file_path in files:
            rel = file_path.relative_to(root)
            content = read_text_safely(file_path)

            header = f"PATH: {rel}\n"
            f.write(header)
            f.write("-" * (len(header) - 1) + "\n")
            f.write(content)
            if not content.endswith("\n"):
                f.write("\n")
            f.write(SEPARATOR)

            total_files += 1
            try:
                total_bytes += file_path.stat().st_size
            except OSError:
                pass

    return total_files, total_bytes


def main() -> None:
    parser = argparse.ArgumentParser(description="Crawl a folder and dump .py/.css/.html/.js into one txt file.")
    parser.add_argument("root", nargs="?", default=".", help="Root folder to crawl (default: current directory).")
    parser.add_argument("-o", "--out", default="dump.txt", help="Output txt file path (default: dump.txt).")
    parser.add_argument(
        "--exts",
        default=",".join(sorted(DEFAULT_EXTS)),
        help="Comma-separated extensions to include (default: .py,.css,.html,.js).",
    )
    parser.add_argument(
        "--exclude-dirs",
        default=",".join(sorted(DEFAULT_EXCLUDE_DIRS)),
        help="Comma-separated directory names to exclude (default includes venv,node_modules,.git,...).",
    )

    args = parser.parse_args()

    root = Path(args.root)
    out_file = Path(args.out)
    exts = {e.strip().lower() if e.strip().startswith(".") else "." + e.strip().lower()
            for e in args.exts.split(",") if e.strip()}
    exclude_dirs = {d.strip() for d in args.exclude_dirs.split(",") if d.strip()}

    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Root folder does not exist or is not a directory: {root}")

    n_files, n_bytes = crawl_and_dump(root, out_file, exts, exclude_dirs)
    print(f"Done: wrote {n_files} files (~{n_bytes} bytes) to {out_file.resolve()}")


if __name__ == "__main__":
    main()
