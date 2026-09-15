"""Offline handoff checks: no production data or credentials."""
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import audio_client as client


class ClientSafety(unittest.TestCase):
    def test_invalid_origins_never_open_network(self):
        for base in ("http://example.test", "https://user:pass@example.test", "https://example.test/path", "https://example.test?key=x", "https://example.test#fragment", ""):
            with self.subTest(base=base), patch.object(client, "BASE", base), patch("urllib.request.build_opener") as opener:
                with self.assertRaises(ValueError):
                    client.request("health")
                opener.assert_not_called()

    def test_missing_service_token_never_opens_network(self):
        with patch.object(client, "BASE", "https://example.test"), patch.object(client, "TOKEN", "test-only"), patch.dict(os.environ, {"AUDIO_SERVICE_TOKEN": ""}), patch("urllib.request.build_opener") as opener:
            with self.assertRaises(ValueError):
                client.request("health")
            opener.assert_not_called()

    def test_redirects_are_refused(self):
        handler = client.NoRedirect()
        req = Request("https://example.test", headers={"X-Audio-Service-Token": "test-only"})
        for status in (301, 302, 303, 307, 308):
            with self.subTest(status=status):
                self.assertIsNone(handler.redirect_request(req, None, status, "redirect", {}, "https://other.test"))

    def test_error_body_is_not_exposed(self):
        with patch.object(client, "BASE", "https://example.test"), patch.object(client, "TOKEN", "test-only"), patch.dict(os.environ, {"AUDIO_SERVICE_TOKEN": "test-only"}), patch("urllib.request.build_opener") as opener:
            opener.return_value.open.side_effect = HTTPError("https://example.test", 302, "redirect", {}, io.BytesIO(b"private upstream body"))
            with self.assertRaises(RuntimeError) as error:
                client.request("health")
            self.assertIn("302", str(error.exception))
            self.assertNotIn("private upstream body", str(error.exception))


class MigrationHandoff(unittest.TestCase):
    def test_fresh_schema_and_document_versions(self):
        with sqlite3.connect(":memory:") as db:
            journal = json.loads((ROOT / "drizzle/meta/_journal.json").read_text())
            for entry in journal["entries"]:
                db.executescript((ROOT / "drizzle" / (entry["tag"] + ".sql")).read_text())
            db.execute("INSERT INTO recordings (id,owner,name,size,parts,created) VALUES ('r','owner','synthetic.wav',10,1,'2026-01-01')")
            for version in ("v1", "v2"):
                db.execute("INSERT INTO documents (id,recording,kind,key,content,asr_json,created) VALUES (?, 'r','summary','legacy',?, '{}', ?)", (version, "合成測試 " + version, version))
            self.assertEqual(db.execute("SELECT count(*) FROM documents WHERE recording='r'").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT content FROM documents ORDER BY created DESC LIMIT 1").fetchone()[0], "合成測試 v2")
            self.assertIn("result", [row[1] for row in db.execute("PRAGMA table_info(chunks)")])
            db.execute("INSERT INTO groq_credentials VALUES ('owner','synthetic ciphertext','2026-01-01')")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO groq_credentials VALUES ('owner','duplicate','2026-01-02')")


if __name__ == "__main__":
    unittest.main()
