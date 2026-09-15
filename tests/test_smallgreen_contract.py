import json
import os
import unittest
from pathlib import Path

try:
    import yaml
    from jsonschema import Draft202012Validator
except ImportError:  # The dedicated SmallGreen CI job installs contract dependencies.
    yaml = None
    Draft202012Validator = None


ROOT = Path(__file__).resolve().parents[1]
SPEC = Path(os.environ.get("SMALLGREEN_SPEC_PATH", ROOT.parent / "spec"))


@unittest.skipUnless(yaml and Draft202012Validator, "install pyyaml and jsonschema to validate SmallGreen contracts")
class SmallGreenContractTest(unittest.TestCase):
    def load_yaml(self, relative_path: str):
        return yaml.safe_load((ROOT / relative_path).read_text(encoding="utf-8"))

    def test_four_contracts_exist(self):
        for name in ("profile.yaml", "acceptance.yaml", "maintenance.yaml", "install.yaml"):
            with self.subTest(name=name):
                self.assertTrue((ROOT / ".smallgreen" / name).is_file())

    def test_contracts_match_schemas(self):
        for name in ("profile", "acceptance", "maintenance", "install"):
            with self.subTest(name=name):
                schema = json.loads((SPEC / "schemas" / f"{name}.schema.json").read_text(encoding="utf-8"))
                errors = list(Draft202012Validator(schema).iter_errors(self.load_yaml(f".smallgreen/{name}.yaml")))
                self.assertEqual(errors, [], "\n".join(error.message for error in errors))

    def test_sites_only_resource_and_secret_boundary(self):
        contract = self.load_yaml(".smallgreen/install.yaml")
        self.assertEqual(contract["target"], {
            "client": "chatgpt-work",
            "hosting": "sites",
            "execution_mode": "native-sites",
        })
        self.assertEqual(contract["hosting"]["external_infrastructure"], [])
        self.assertEqual(contract["hosting"]["managed_resources"], ["site", "d1", "r2"])
        self.assertEqual(contract["interaction"]["user_inputs"], [{
            "name": "GROQ_API_KEY",
            "timing": "after-deploy",
            "entry_channel": "application-ui",
            "chat_handling": "forbidden",
            "setup_path": "/#groq-settings",
        }])

    def test_native_hosting_manifest_is_minimal(self):
        manifest = json.loads((ROOT / ".openai" / "hosting.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest, {"d1": "DB", "r2": "BUCKET"})


if __name__ == "__main__":
    unittest.main()
