#!/usr/bin/env python3
"""Export WortUniversum SQLite tables into small CSV files for the admin importer.

The source database is opened read-only. Gzip input is decompressed into a
temporary directory. Each output CSV is kept under the importer size/row limits.
Only Python's standard library is required.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import shutil
import sqlite3
import tempfile
from pathlib import Path
from typing import Iterable, Sequence


DEFAULT_MAX_ROWS = 500
MAX_ROWS_LIMIT = 5_000
DEFAULT_MAX_BYTES = 7 * 1024 * 1024
TABLES = ("words", "phrasal_verbs")


def csv_line(values: Sequence[object]) -> str:
    buffer = io.StringIO(newline="")
    csv.writer(buffer, lineterminator="\n").writerow(
        ["" if value is None else value for value in values]
    )
    return buffer.getvalue()


def write_table_chunks(
    connection: sqlite3.Connection,
    table: str,
    output_dir: Path,
    max_rows: int,
    max_bytes: int,
    record_limit: int | None = None,
) -> tuple[int, list[Path]]:
    columns = [
        row[1]
        for row in connection.execute("PRAGMA table_info(" + table + ")").fetchall()
    ]
    if not columns:
        return 0, []

    order_by = "id" if "id" in columns else columns[0]
    query = "SELECT * FROM " + table + " ORDER BY " + order_by
    if record_limit is not None:
        query += " LIMIT " + str(record_limit)
    cursor = connection.execute(query)
    header = csv_line(columns)
    header_bytes = len(header.encode("utf-8"))
    current_lines: list[str] = []
    current_bytes = header_bytes
    chunk_number = 1
    exported = 0
    output_files: list[Path] = []

    def flush() -> None:
        nonlocal current_lines, current_bytes, chunk_number
        if not current_lines:
            return
        path = output_dir / (table + "_" + str(chunk_number).zfill(3) + ".csv")
        with path.open("w", encoding="utf-8", newline="") as output:
            output.write(header)
            output.writelines(current_lines)
        actual_size = path.stat().st_size
        if actual_size > max_bytes:
            raise RuntimeError(
                "Output file exceeded the size limit after writing: " + str(path)
            )
        output_files.append(path)
        chunk_number += 1
        current_lines = []
        current_bytes = header_bytes

    for row in cursor:
        line = csv_line(tuple(row))
        line_bytes = len(line.encode("utf-8"))
        if header_bytes + line_bytes > max_bytes:
            raise RuntimeError(
                "A single record in table '" + table
                + "' is larger than the configured CSV file limit."
            )
        if current_lines and (
            len(current_lines) >= max_rows
            or current_bytes + line_bytes > max_bytes
        ):
            flush()
        current_lines.append(line)
        current_bytes += line_bytes
        exported += 1

    flush()
    return exported, output_files


def export_database(
    database_path: Path,
    output_dir: Path,
    max_rows: int = DEFAULT_MAX_ROWS,
    max_bytes: int = DEFAULT_MAX_BYTES,
    limit_per_table: int | None = None,
) -> dict[str, tuple[int, list[Path]]]:
    if not database_path.is_file():
        raise FileNotFoundError("Database file not found: " + str(database_path))
    if max_rows < 1 or max_rows > MAX_ROWS_LIMIT:
        raise ValueError("max_rows must be between 1 and 5000.")
    if limit_per_table is not None and limit_per_table < 1:
        raise ValueError("limit_per_table must be at least 1.")
    if max_bytes < 1024 or max_bytes > DEFAULT_MAX_BYTES:
        raise ValueError("max_bytes must be between 1024 and 7 MiB.")

    output_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, tuple[int, list[Path]]] = {}

    with tempfile.TemporaryDirectory(prefix="worduniversum-export-") as temporary:
        temp_dir = Path(temporary)
        if database_path.name.lower().endswith(".gz"):
            unpacked_path = temp_dir / "grundwortschatz_en.db"
            with gzip.open(database_path, "rb") as compressed, unpacked_path.open("wb") as unpacked:
                shutil.copyfileobj(compressed, unpacked)
            actual_database_path = unpacked_path
        else:
            actual_database_path = database_path.resolve()

        database_uri = actual_database_path.as_uri() + "?mode=ro"
        connection = sqlite3.connect(database_uri, uri=True)
        try:
            table_names = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            if "words" not in table_names:
                raise RuntimeError("The SQLite file does not contain the required 'words' table.")

            for table in TABLES:
                if table not in table_names:
                    if table == "phrasal_verbs":
                        continue
                    raise RuntimeError("Required table not found: " + table)
                results[table] = write_table_chunks(
                    connection, table, output_dir, max_rows, max_bytes, limit_per_table
                )
        finally:
            connection.close()

    return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert WortUniversum SQLite/.db.gz tables into importer-ready CSV chunks."
    )
    parser.add_argument("database", type=Path, help="Path to grundwortschatz_en.db or .db.gz")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("worduniversum-import"),
        help="Directory for the generated CSV files (default: ./worduniversum-import)",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=DEFAULT_MAX_ROWS,
        help="Maximum source rows per CSV (default: 500; maximum: 5000)",
    )
    parser.add_argument(
        "--limit-per-table",
        type=int,
        help="Optional first-N sample from each table; omit to export all rows.",
    )
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=DEFAULT_MAX_BYTES,
        help="Maximum CSV file size in bytes (default: 7340032)",
    )
    args = parser.parse_args()

    try:
        results = export_database(args.database, args.output_dir, args.max_rows, args.max_bytes, args.limit_per_table)
    except Exception as error:
        parser.exit(2, "Export failed: " + str(error) + "\n")

    print("WortUniversum export completed.")
    for table, (count, files) in results.items():
        total_bytes = sum(path.stat().st_size for path in files)
        print(
            table + ": " + str(count) + " rows -> " + str(len(files))
            + " CSV file(s), " + str(total_bytes) + " bytes"
        )
        for path in files:
            print("  " + str(path) + " (" + str(path.stat().st_size) + " bytes)")
    print("Upload each CSV in the super-admin importer. All rows will remain pending review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
