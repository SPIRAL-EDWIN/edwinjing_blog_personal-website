import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import write_github_repo_facts as facts_writer


class RepoFactsWriterTest(unittest.TestCase):
    def test_validate_maps_github_response(self):
        result = facts_writer.validate_facts(
            {"stargazers_count": 4, "forks_count": 0},
            "owner/repo",
        )
        self.assertEqual(result["repository"], "owner/repo")
        self.assertEqual(result["stars"], 4)
        self.assertEqual(result["forks"], 0)

    def test_validate_rejects_missing_negative_and_boolean_counts(self):
        invalid = (
            {},
            {"stargazers_count": -1, "forks_count": 0},
            {"stargazers_count": True, "forks_count": 0},
            {"repository": "other/repo", "stars": 4, "forks": 0},
        )
        for payload in invalid:
            with self.subTest(payload=payload):
                with self.assertRaises(facts_writer.RepoFactsError):
                    facts_writer.validate_facts(payload, "owner/repo")

    def test_fallback_is_preserved_when_fetch_fails(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "facts.json"
            output.write_text(
                json.dumps({
                    "repository": "owner/repo",
                    "stars": 7,
                    "forks": 2,
                    "generated_at": "2026-08-08T12:00:00+00:00",
                }),
                encoding="utf-8",
            )
            with mock.patch.object(
                facts_writer,
                "fetch_facts",
                side_effect=facts_writer.RepoFactsError("rate limited"),
            ):
                status = facts_writer.refresh_facts("owner/repo", output, "secret-token")
            written = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual((written["stars"], written["forks"]), (7, 2))
            self.assertEqual(written["generated_at"], "2026-08-08T12:00:00+00:00")
            self.assertIn("kept valid fallback", status)

    def test_fetch_uses_token_without_exposing_it_in_result(self):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        response.read.return_value = b'{"stargazers_count": 4, "forks_count": 0}'
        with mock.patch.object(facts_writer.urllib.request, "urlopen", return_value=response) as urlopen:
            result = facts_writer.fetch_facts("owner/repo", "secret-token")
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer secret-token")
        self.assertNotIn("secret-token", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
