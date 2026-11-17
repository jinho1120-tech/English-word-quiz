#!/usr/bin/env python3
"""Download and audit the public WortUniversum SQLite dataset; preserve source DB."""
import csv, gzip, hashlib, json, shutil, sqlite3, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

URL = "https://huggingface.co/datasets/cstr/grundwortschatz-voc-en/resolve/main/grundwortschatz_en.db.gz"
EXPECTED_SHA256 = "67ec4c3df4bbf5b71fc19d443d3782cca07c3e1cb453de30050e117d0068a83c"

def dump_csv(path, fields, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

def parse_json(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default

def main():
    out = Path("artifacts")
    out.mkdir(exist_ok=True)
    gz, db = out / "grundwortschatz_en.db.gz", out / "grundwortschatz_en.db"
    req = urllib.request.Request(URL, headers={"User-Agent": "EnglishWordQuiz-Dataset-Audit/1.0"})
    with urllib.request.urlopen(req, timeout=180) as response, gz.open("wb") as target:
        shutil.copyfileobj(response, target, 1024 * 1024)
    digest = hashlib.sha256(gz.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise RuntimeError("SHA-256 mismatch; received " + digest)
    with gzip.open(gz, "rb") as source, db.open("wb") as target:
        shutil.copyfileobj(source, target, 1024 * 1024)
    with db.open("rb") as f:
        if f.read(16) != b"SQLite format 3\\x00":
            raise RuntimeError("Downloaded file is not SQLite")

    con = sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError("SQLite integrity_check: " + str(integrity))
        master = con.execute("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
        tables, schema, table_rows, column_rows = {}, {}, [], []
        for obj in master:
            if obj["type"] != "table" or not obj["sql"] or "CREATE VIRTUAL TABLE" in obj["sql"].upper():
                continue
            name = obj["name"]
            qname = '"' + name.replace('"', '""') + '"'
            cols = con.execute("PRAGMA table_info(" + qname + ")").fetchall()
            count = con.execute("SELECT COUNT(*) FROM " + qname).fetchone()[0]
            tables[name] = count
            table_rows.append({"table": name, "rows": count, "columns": ", ".join(c["name"] for c in cols)})
            schema[name] = {"create_sql": obj["sql"], "columns": [dict(c) for c in cols], "foreign_keys": [dict(x) for x in con.execute("PRAGMA foreign_key_list(" + qname + ")")]}
            for col in cols:
                qcol = '"' + col["name"].replace('"', '""') + '"'
                nonempty = con.execute("SELECT COUNT(*) FROM " + qname + " WHERE " + qcol + " IS NOT NULL AND TRIM(CAST(" + qcol + " AS TEXT))<>''").fetchone()[0]
                column_rows.append({"table": name, "column": col["name"], "type": col["type"], "nonempty": nonempty, "rows": count, "coverage_percent": round(nonempty * 100 / count, 2) if count else 0})
        if "words" not in tables:
            raise RuntimeError("The expected words table is missing")

        words = con.execute('SELECT * FROM "words" ORDER BY id').fetchall()
        examples = defaultdict(list)
        if "examples" in tables:
            for r in con.execute('SELECT word_id,sentence FROM "examples" ORDER BY word_id,id'):
                examples[r["word_id"]].append(r["sentence"])
        inventory, lemma_counts = [], Counter()
        pos_counts, grade_counts, cefr_counts, yle_counts, status_counts = [Counter() for _ in range(5)]
        grade_example_levels = Counter()
        cefr_n = definition_n = grade_examples_n = example_n = 0
        for row in words:
            d = dict(row)
            lemma = d.get("lemma") or d.get("word") or ""
            key = " ".join(str(lemma).casefold().split())
            if key:
                lemma_counts[key] += 1
            pos, grade = d.get("word_type") or "", d.get("grade_level")
            if pos: pos_counts[str(pos)] += 1
            if grade is not None: grade_counts[str(grade)] += 1
            enrichment = parse_json(d.get("enrichment_json"), {})
            metadata = parse_json(d.get("metadata_json"), {})
            frequency = parse_json(d.get("frequency_json"), {})
            definitions = enrichment.get("definitions", []) if isinstance(enrichment, dict) else []
            grade_examples = metadata.get("grade_examples", {}) if isinstance(metadata, dict) else {}
            extra_examples = enrichment.get("examples", []) if isinstance(enrichment, dict) else []
            cefr, yle = metadata.get("cefr_level"), metadata.get("yle_level")
            status = enrichment.get("enrichment_status", "")
            if cefr: cefr_n += 1; cefr_counts[str(cefr)] += 1
            if yle: yle_counts[str(yle)] += 1
            if status: status_counts[str(status)] += 1
            if definitions: definition_n += 1
            if grade_examples:
                grade_examples_n += 1
                for level, vals in grade_examples.items():
                    if isinstance(vals, list) and vals: grade_example_levels[str(level)] += 1
            db_examples = examples.get(d["id"], [])
            if db_examples or extra_examples or any(grade_examples.values() if isinstance(grade_examples, dict) else []):
                example_n += 1
            inventory.append({
                "id": d.get("id"), "original_id": d.get("original_id"), "word": d.get("word"), "lemma": lemma,
                "word_type": pos, "article": d.get("article"), "grade_level": grade, "cefr_level": cefr or "", "yle_level": yle or "",
                "zipf": frequency.get("zipf", "") if isinstance(frequency, dict) else "",
                "per_million": frequency.get("per_million", "") if isinstance(frequency, dict) else "",
                "frequency_band": frequency.get("frequency_band", "") if isinstance(frequency, dict) else "",
                "definitions_json": json.dumps(definitions, ensure_ascii=False),
                "grade_examples_json": json.dumps(grade_examples, ensure_ascii=False),
                "enrichment_examples_json": json.dumps(extra_examples, ensure_ascii=False),
                "database_examples_json": json.dumps(db_examples, ensure_ascii=False),
                "synonyms_json": json.dumps(enrichment.get("synonyms", []), ensure_ascii=False),
                "antonyms_json": json.dumps(enrichment.get("antonyms", []), ensure_ascii=False),
                "wordnet_senses_json": json.dumps(enrichment.get("wordnetSenses", []), ensure_ascii=False),
                "tags_json": json.dumps(metadata.get("tags", []) if isinstance(metadata, dict) else [], ensure_ascii=False),
                "sources_json": json.dumps(metadata.get("sources", []) if isinstance(metadata, dict) else [], ensure_ascii=False),
                "enrichment_status": status,
            })

        duplicates = []
        for lemma, n in sorted(lemma_counts.items()):
            if n > 1:
                matched = [r for r in words if " ".join(str(r["lemma"] or r["word"] or "").casefold().split()) == lemma]
                duplicates.append({"lemma": lemma, "record_count": n, "parts_of_speech": ", ".join(sorted({str(r["word_type"] or "") for r in matched})), "record_ids": ", ".join(str(r["id"]) for r in matched)})

        phrasals = []
        if "phrasal_verbs" in tables:
            for r in con.execute('SELECT * FROM "phrasal_verbs" ORDER BY id'):
                values = dict(r)
                phrasals.append({k: json.dumps(parse_json(v, v), ensure_ascii=False) if k.endswith("_json") else v for k,v in values.items()})

        report = {
            "dataset": "cstr/grundwortschatz-voc-en", "source_url": URL, "license": "CC BY-SA 4.0",
            "source_sha256": digest, "sqlite_integrity_check": integrity, "tables": tables,
            "words": {
                "word_pos_records": len(words), "distinct_normalized_lemmas": len(lemma_counts),
                "multi_record_lemmas": len(duplicates), "extra_records_over_one_per_lemma": sum(n-1 for n in lemma_counts.values() if n > 1),
                "pos_distribution": dict(sorted(pos_counts.items())), "grade_level_distribution": dict(sorted(grade_counts.items())),
                "cefr_distribution": dict(sorted(cefr_counts.items())), "cefr_coverage": cefr_n,
                "cefr_coverage_percent": round(100*cefr_n/len(words), 2) if words else 0,
                "yle_distribution": dict(sorted(yle_counts.items())), "enrichment_status_distribution": dict(sorted(status_counts.items())),
                "definition_coverage": definition_n, "definition_coverage_percent": round(100*definition_n/len(words), 2) if words else 0,
                "grade_examples_coverage": grade_examples_n, "grade_examples_by_level": dict(sorted(grade_example_levels.items())),
                "records_with_any_example": example_n, "any_example_coverage_percent": round(100*example_n/len(words), 2) if words else 0,
            },
            "phrasal_verbs": {"rows": tables.get("phrasal_verbs", 0)},
            "notes": ["Original SQLite database is preserved unchanged.", "Word rows may have multiple POS records per lemma.", "Korean meanings and translations are not generated by this audit."]
        }
        dump_csv(out / "table_inventory.csv", ["table","rows","columns"], table_rows)
        dump_csv(out / "column_coverage.csv", ["table","column","type","nonempty","rows","coverage_percent"], column_rows)
        dump_csv(out / "word_inventory.csv", list(inventory[0].keys()), inventory)
        dump_csv(out / "duplicate_lemmas.csv", ["lemma","record_count","parts_of_speech","record_ids"], duplicates)
        if phrasals:
            dump_csv(out / "phrasal_verbs.csv", list(phrasals[0].keys()), phrasals)
        virtual = [{"name": r["name"], "sql": r["sql"]} for r in master if r["type"]=="table" and r["sql"] and "CREATE VIRTUAL TABLE" in r["sql"].upper()]
        views = [{"name": r["name"], "sql": r["sql"]} for r in master if r["type"]=="view"]
        indexes = [{"name": r["name"], "table": r["tbl_name"], "sql": r["sql"]} for r in master if r["type"]=="index"]
        (out / "schema.json").write_text(json.dumps({"tables":schema,"virtual_tables":virtual,"views":views,"indexes":indexes}, ensure_ascii=False, indent=2), encoding="utf-8")
        (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        w = report["words"]
        lines = ["# WortUniversum DB inspection", "", f"- Source: {URL}", "- License: CC BY-SA 4.0", f"- SHA-256: {digest}", f"- SQLite integrity: {integrity}", "", "## Table row counts", "", "| Table | Rows |", "|---|---:|"]
        lines += [f"| {name} | {count:,} |" for name,count in sorted(tables.items())]
        lines += ["", "## Word records", "", f"- Word/POS rows: {w['word_pos_records']:,}", f"- Unique normalized lemmas: {w['distinct_normalized_lemmas']:,}", f"- Lemmas with multiple rows: {w['multi_record_lemmas']:,}", f"- CEFR coverage: {w['cefr_coverage']:,} ({w['cefr_coverage_percent']}%)", f"- Definition coverage: {w['definition_coverage']:,} ({w['definition_coverage_percent']}%)", f"- Any example coverage: {w['records_with_any_example']:,} ({w['any_example_coverage_percent']}%)", "", "Analysis files include word_inventory.csv, phrasal_verbs.csv, duplicate_lemmas.csv, table_inventory.csv, column_coverage.csv, schema.json, the unmodified SQLite source DB and original gzip."]
        (out / "report.md").write_text("\\n".join(lines), encoding="utf-8")
        (out / "ATTRIBUTION.txt").write_text("WortUniversum English vocabulary database\\nDataset: cstr/grundwortschatz-voc-en\\nSource: " + URL + "\\nLicense: CC BY-SA 4.0\\nSHA-256: " + digest + "\\n\\nRefer to the dataset README for complete source-by-source attribution and licensing. Redistributed derivative datasets must satisfy applicable attribution and share-alike obligations.\\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        con.close()

if __name__ == "__main__":
    main()
