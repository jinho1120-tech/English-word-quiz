from __future__ import annotations

import csv
import gzip
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPORT_SCRIPT = ROOT / "scripts" / "export_worduniversum_sqlite.py"


class WortUniversumExportTests(unittest.TestCase):
    def test_gzip_database_is_exported_as_size_and_row_limited_csv(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            temp_dir = Path(temporary)
            database = temp_dir / "grundwortschatz_en.db"
            compressed_database = temp_dir / "grundwortschatz_en.db.gz"
            output_dir = temp_dir / "csv-output"

            connection = sqlite3.connect(database)
            connection.executescript(
                """
                CREATE TABLE words (
                    id INTEGER PRIMARY KEY,
                    original_id TEXT,
                    word TEXT,
                    lemma TEXT,
                    word_type TEXT,
                    grade_level INTEGER,
                    enrichment_json TEXT,
                    metadata_json TEXT
                );
                CREATE TABLE phrasal_verbs (
                    id INTEGER PRIMARY KEY,
                    word_id INTEGER,
                    phrasal TEXT,
                    meaning TEXT,
                    senses_json TEXT,
                    wiktionary_examples_json TEXT
                );
                """
            )
            for index in range(5):
                connection.execute(
                    "INSERT INTO words VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        index + 1,
                        "word_" + str(index + 1),
                        "word" + str(index + 1),
                        "word" + str(index + 1),
                        "noun",
                        1,
                        json.dumps({"definitions": ["Definition " + str(index + 1)]}),
                        json.dumps({"cefr_level": "A1", "gradeLevelEstimate": 1}),
                    ),
                )
            connection.execute(
                "INSERT INTO phrasal_verbs VALUES (?, ?, ?, ?, ?, ?)",
                (
                    1,
                    1,
                    "give up",
                    "to stop trying",
                    json.dumps(["to stop trying", "to quit"]),
                    json.dumps(["Do not give up."]),
                ),
            )
            connection.commit()
            connection.close()

            with database.open("rb") as source, gzip.open(compressed_database, "wb") as target:
                target.write(source.read())

            completed = subprocess.run(
                [
                    sys.executable,
                    str(EXPORT_SCRIPT),
                    str(compressed_database),
                    "--output-dir",
                    str(output_dir),
                    "--max-rows",
                    "2",
                    "--max-bytes",
                    "1024",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            words_files = sorted(output_dir.glob("words_*.csv"))
            phrasal_files = sorted(output_dir.glob("phrasal_verbs_*.csv"))
            self.assertEqual(len(words_files), 3)
            self.assertEqual(len(phrasal_files), 1)
            self.assertTrue(all(path.stat().st_size <= 1024 for path in words_files + phrasal_files))

            exported_words = []
            for path in words_files:
                with path.open("r", encoding="utf-8", newline="") as source:
                    exported_words.extend(csv.DictReader(source))
            self.assertEqual(len(exported_words), 5)
            self.assertIn("enrichment_json", exported_words[0])
            self.assertIn("Definition 1", exported_words[0]["enrichment_json"])

            with phrasal_files[0].open("r", encoding="utf-8", newline="") as source:
                exported_phrasal = list(csv.DictReader(source))
            self.assertEqual(exported_phrasal[0]["phrasal"], "give up")
            self.assertIn("to stop trying", exported_phrasal[0]["senses_json"])


if __name__ == "__main__":
    unittest.main()
