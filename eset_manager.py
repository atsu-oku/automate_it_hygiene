#!/usr/bin/env python3
"""
ESET PROTECT On-Prem 11.1 API Manager

This script manages ESET endpoints via JSON-RPC API:
- Read PC names from CSV
- Fetch status (connectivity, AV version, definition date, Windows version, last boot)
- Execute tasks (install/uninstall AV, run commands)
- Dry-run mode
- Cross-platform (Linux/Windows)
"""

import argparse
import csv
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:
    print("ERROR: 'requests' module not found. Run: pip install requests", file=sys.stderr)
    sys.exit(1)


# ============================================================================
# Constants
# ============================================================================

TASK_TYPES = {
    "ExportConfiguration": 1,
    "OnDemandScan": 2,
    "QuarantineManagement": 3,
    "QuarantineUpload": 4,
    "Update": 5,
    "UpdateRollback": 6,
    "SysInspectorScript": 7,
    "SysInspectorLogRequest": 8,
    "RunCommand": 9,
    "SoftwareInstallation": 10,
    "SoftwareUninstallation": 11,
    "SystemUpdate": 12,
}

# API名前空間（ESET PROTECT On-Prem 11.1）
API_NS = "Era.Common.NetworkMessage.ConsoleApi"
API_SESSION = f"{API_NS}.SessionManagement"
API_GROUPS = f"{API_NS}.Groups"
API_TASKS = f"{API_NS}.TasksTriggers"

DEFAULT_TIMEOUT = 30
DEFAULT_RETRIES = 3
DEFAULT_BACKOFF_FACTOR = 0.5


# ============================================================================
# Configuration Management
# ============================================================================

def get_config_path() -> Path:
    """Get configuration file path (XDG on Linux, AppData on Windows)."""
    if sys.platform == "win32":
        config_dir = Path(os.getenv("APPDATA", Path.home() / "AppData" / "Roaming")) / "eset_manager"
    else:
        config_dir = Path(os.getenv("XDG_CONFIG_HOME", Path.home() / ".config")) / "eset_manager"

    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / "config.json"


def load_config(config_file: Optional[Path] = None) -> Dict[str, Any]:
    """Load configuration from file or environment variables."""
    config = {
        "host": os.getenv("ESET_HOST", ""),
        "port": int(os.getenv("ESET_PORT", "2223")),
        "username": os.getenv("ESET_USERNAME", ""),
        "password": os.getenv("ESET_PASSWORD", ""),
        "domain": os.getenv("ESET_DOMAIN", ""),  # AD domain name
        "verify_ssl": os.getenv("ESET_VERIFY_SSL", "true").lower() in ("true", "1", "yes"),
        "use_http": os.getenv("ESET_USE_HTTP", "false").lower() in ("true", "1", "yes"),
        "timeout": int(os.getenv("ESET_TIMEOUT", str(DEFAULT_TIMEOUT))),
        "retries": int(os.getenv("ESET_RETRIES", str(DEFAULT_RETRIES))),
    }

    # Load from file if exists
    if config_file is None:
        config_file = get_config_path()

    if config_file.exists():
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                file_config = json.load(f)
                # File config overrides env vars (except if empty)
                for key in ["host", "username", "password", "domain"]:
                    if file_config.get(key):
                        config[key] = file_config[key]
                for key in ["port", "verify_ssl", "use_http", "timeout", "retries"]:
                    if key in file_config:
                        config[key] = file_config[key]
        except Exception as e:
            logging.warning(f"Failed to load config file {config_file}: {e}")

    # Validate required fields
    if not config["host"]:
        raise ValueError("ESET host not configured. Set ESET_HOST env var or config.json")
    if not config["username"] or not config["password"]:
        raise ValueError("ESET credentials not configured. Set ESET_USERNAME/ESET_PASSWORD env vars or config.json")

    return config


# ============================================================================
# ESET API Client
# ============================================================================

class ESETAPIClient:
    """ESET PROTECT On-Prem 11.1 JSON-RPC API Client."""

    def __init__(self, config: Dict[str, Any], dry_run: bool = False):
        self.config = config
        self.dry_run = dry_run
        # HTTP or HTTPS based on configuration
        protocol = "http" if config.get("use_http", False) else "https"
        self.base_url = f"{protocol}://{config['host']}:{config['port']}/api"
        self.session_token: Optional[str] = None
        self.logger = logging.getLogger(self.__class__.__name__)

        # Setup HTTP session with retry
        self.session = requests.Session()
        retry_strategy = Retry(
            total=config["retries"],
            backoff_factor=DEFAULT_BACKOFF_FACTOR,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        # SSL verification (only relevant for HTTPS)
        if not config["verify_ssl"]:
            self.session.verify = False
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def _mask_password(self, data: Any) -> Any:
        """Mask password in log output."""
        if isinstance(data, dict):
            return {k: "***MASKED***" if k == "password" else self._mask_password(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._mask_password(item) for item in data]
        return data

    def _rpc_call(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Make JSON-RPC call to ESET API."""
        payload = {method: params}

        headers = {"Content-Type": "application/json"}
        if self.session_token:
            headers["Authorization"] = f"Bearer {self.session_token}"

        self.logger.debug(f"RPC Call: {method}")
        self.logger.debug(f"Payload: {json.dumps(self._mask_password(payload), indent=2)}")

        if self.dry_run and method != "Era.Common.NetworkMessage.ConsoleApi.SessionManagement.RpcAuthLoginRequest":
            self.logger.info(f"[DRY-RUN] Would call {method} with params: {self._mask_password(params)}")
            return {"success": True, "dry_run": True}

        try:
            response = self.session.post(
                self.base_url,
                json=payload,
                headers=headers,
                timeout=self.config["timeout"],
            )
            response.raise_for_status()

            result = response.json()
            self.logger.debug(f"Response: {json.dumps(result, indent=2)[:500]}...")

            return result
        except requests.exceptions.RequestException as e:
            self.logger.error(f"API call failed: {e}")
            raise

    def login(self) -> bool:
        """Authenticate and get session token.

        Supports both local and AD (domain) authentication:
        - Local: Set username/password only
        - AD: Set domain + username + password (or use DOMAIN\\username format)
        """
        # Determine if this is AD authentication
        domain = self.config.get("domain", "")
        username = self.config["username"]
        is_domain_user = bool(domain) or "\\" in username or "@" in username

        # If domain is specified separately, prepend it to username
        if domain and "\\" not in username and "@" not in username:
            username = f"{domain}\\{username}"

        self.logger.debug(f"Authentication mode: {'AD/Domain' if is_domain_user else 'Local'}")

        try:
            result = self._rpc_call(
                f"{API_SESSION}.RpcAuthLoginRequest",
                {
                    "username": username,
                    "password": self.config["password"],
                    "isDomainUser": is_domain_user,
                    "locale": "en-US",
                }
            )

            # Extract user UUID from response
            # NOTE: Response contains userUuid, session is managed via cookies
            response_key = f"{API_SESSION}.RpcAuthLoginResponse"
            if response_key in result:
                user_uuid = result[response_key].get("userUuid", {})
                if isinstance(user_uuid, dict):
                    self.session_token = user_uuid.get("uuid")
                else:
                    self.session_token = user_uuid
                self.logger.info(f"Successfully authenticated (user UUID: {self.session_token})")
                return True
            else:
                self.logger.error(f"Unexpected login response format: {result}")
                return False
        except Exception as e:
            self.logger.error(f"Login failed: {e}")
            return False

    def get_computers(self, parent_group_uuid: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get list of computers (optionally filtered by group)."""
        # NOTE: 実際のAPI仕様に基づく形式（parentGroupUuidはオブジェクト形式）
        params: Dict[str, Any] = {
            "parentGroupUuid": {"uuid": parent_group_uuid or "00000000-0000-0000-0000-000000000000"}
        }

        result = self._rpc_call(
            f"{API_GROUPS}.RpcExportComputersRequest",
            params
        )

        # NOTE: Response may contain serializedComputers (string) or computers (array)
        response_key = f"{API_GROUPS}.RpcExportComputersResponse"
        if response_key in result:
            response_data = result[response_key]
            # Handle serialized format
            if "serializedComputers" in response_data:
                try:
                    return json.loads(response_data["serializedComputers"])
                except json.JSONDecodeError:
                    self.logger.warning("Failed to parse serializedComputers")
                    return []
            return response_data.get("computers", [])
        return []

    def get_computer_by_name(self, computer_name: str) -> Optional[Dict[str, Any]]:
        """Find computer by name."""
        computers = self.get_computers()

        # Case-insensitive search
        for comp in computers:
            # NOTE: Field name may be 'name', 'computerName', 'hostname', etc.
            comp_name = comp.get("name") or comp.get("computerName") or comp.get("hostname", "")
            if comp_name.lower() == computer_name.lower():
                return comp

        return None

    def get_computer_details(self, computer_uuid: str) -> Optional[Dict[str, Any]]:
        """Get detailed computer information."""
        # NOTE: 実際のAPI仕様に基づく形式（computerUuidはオブジェクト形式）
        result = self._rpc_call(
            f"{API_GROUPS}.RpcGetComputerRequest",
            {"computerUuid": {"uuid": computer_uuid}}
        )

        response_key = f"{API_GROUPS}.RpcGetComputerResponse"
        if response_key in result:
            # Response structure: computers array or single computer object
            response_data = result[response_key]
            if "computers" in response_data and response_data["computers"]:
                return response_data["computers"][0]
            return response_data.get("computer") or response_data
        return None

    def create_client_task(
        self,
        task_type: int,
        target_uuids: List[str],
        task_name: Optional[str] = None,
        description: Optional[str] = None,
        **kwargs
    ) -> Optional[str]:
        """Create a client task."""
        # NOTE: 実際のAPI仕様に基づく形式（ESET PROTECT 11.1 JSON-RPC）
        task_config: Dict[str, Any] = {
            "taskType": task_type,
        }

        # タスクタイプ別のパラメータ設定
        if task_type == TASK_TYPES["RunCommand"]:
            task_config["taskRunCommand"] = {
                "commandLine": kwargs.get("command", ""),
                "workingDirectory": kwargs.get("workingDirectory", ""),
            }
        elif task_type == TASK_TYPES["SoftwareInstallation"]:
            task_config["taskSoftwareInstall"] = {
                "packagePath": kwargs.get("packagePath", ""),
                "silent": True,
            }
        elif task_type == TASK_TYPES["SoftwareUninstallation"]:
            task_config["taskSoftwareUninstall"] = {
                "packageName": kwargs.get("packageName", ""),
                "silent": True,
            }
        elif task_type == TASK_TYPES["OnDemandScan"]:
            task_config["taskOnDemandScan"] = {
                "scanProfile": 0,
                "scanTargets": ["eset://AllTargets"],
                "cleaningEnabled": True,
            }
        elif task_type == TASK_TYPES["Update"]:
            task_config["taskUpdate"] = {}

        params = {
            "staticObjectData": {
                "name": task_name or f"Task_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "description": description or f"Created by eset_manager.py at {datetime.now().isoformat()}",
            },
            "clientTaskConfiguration": task_config,
            "targets": [{"uuid": uuid} for uuid in target_uuids],
        }

        result = self._rpc_call(
            f"{API_TASKS}.RpcCreateClientTaskRequest",
            params
        )

        if self.dry_run:
            return "dry-run-task-id"

        # NOTE: Response contains staticObjectIdentification with uuid
        response_key = f"{API_TASKS}.RpcCreateClientTaskResponse"
        if response_key in result:
            response_data = result[response_key]
            task_id = response_data.get("staticObjectIdentification", {})
            if isinstance(task_id, dict):
                return task_id.get("uuid", {}).get("uuid")
            return response_data.get("taskUuid") or response_data.get("taskId")
        return None


# ============================================================================
# Computer Information Extractor
# ============================================================================

class ComputerInfoExtractor:
    """Extract and format computer information from API response."""

    @staticmethod
    def extract_info(computer_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract key information from computer data.

        NOTE: Field names are based on common patterns but may need adjustment
        for your specific ESET PROTECT version. Check actual API response.
        """
        info = {
            "name": "",
            "connected": False,
            "av_version": "",
            "av_module_version": "",
            "definition_date": "",
            "windows_version": "",
            "last_boot": "",
            "last_seen": "",
            "uuid": "",
        }

        # Basic info
        info["name"] = computer_data.get("name") or computer_data.get("computerName") or computer_data.get("hostname", "UNKNOWN")
        info["uuid"] = computer_data.get("uuid") or computer_data.get("computerUuid", "")

        # Connection status
        # Check various possible fields
        info["connected"] = (
            computer_data.get("connected", False) or
            computer_data.get("isConnected", False) or
            computer_data.get("status") == "connected"
        )

        # Last seen
        last_seen = computer_data.get("lastSeenTime") or computer_data.get("lastSeen") or computer_data.get("lastConnected")
        if last_seen:
            info["last_seen"] = ComputerInfoExtractor._format_timestamp(last_seen)

        # AV information (may be nested in 'security' or 'antivirus' object)
        security = computer_data.get("security") or computer_data.get("antivirus") or {}
        info["av_version"] = security.get("version") or computer_data.get("avVersion", "")
        info["av_module_version"] = security.get("moduleVersion") or computer_data.get("avModuleVersion", "")

        # Virus definition date
        def_date = security.get("virusDbVersion") or security.get("definitionDate") or computer_data.get("virusDbVersion")
        if def_date:
            info["definition_date"] = ComputerInfoExtractor._format_timestamp(def_date)

        # OS information (may be nested in 'operatingSystem' object)
        os_info = computer_data.get("operatingSystem") or {}
        info["windows_version"] = (
            os_info.get("displayName") or
            os_info.get("name") or
            computer_data.get("osVersion") or
            computer_data.get("operatingSystem", "")
        )

        # Last boot time
        last_boot = os_info.get("lastBootTime") or computer_data.get("lastBootTime") or computer_data.get("bootTime")
        if last_boot:
            info["last_boot"] = ComputerInfoExtractor._format_timestamp(last_boot)

        return info

    @staticmethod
    def _format_timestamp(ts: Any) -> str:
        """Format timestamp to readable string."""
        if not ts:
            return ""

        # Handle different timestamp formats
        if isinstance(ts, int):
            # Unix timestamp (seconds or milliseconds)
            if ts > 10000000000:  # milliseconds
                ts = ts / 1000
            try:
                return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
            except:
                return str(ts)
        elif isinstance(ts, str):
            # ISO format or other string
            try:
                # Try parsing ISO format
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            except:
                return ts

        return str(ts)


# ============================================================================
# Main Application Logic
# ============================================================================

class ESETManager:
    """Main ESET Manager application."""

    def __init__(self, client: ESETAPIClient):
        self.client = client
        self.logger = logging.getLogger(self.__class__.__name__)

    def read_computer_names_from_csv(self, csv_file: Path) -> List[str]:
        """Read computer names from CSV file (expects 'name' or first column)."""
        if not csv_file.exists():
            raise FileNotFoundError(f"CSV file not found: {csv_file}")

        names = []
        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            # Detect name column
            if reader.fieldnames:
                name_col = next((col for col in reader.fieldnames if col.lower() in ["name", "computer", "hostname", "pc"]), None)
                if not name_col:
                    # Use first column
                    name_col = reader.fieldnames[0]
                    self.logger.warning(f"No 'name' column found, using first column: {name_col}")

                for row in reader:
                    name = row.get(name_col, "").strip()
                    if name:
                        names.append(name)
            else:
                # Fallback: read first column without header
                f.seek(0)
                csv_reader = csv.reader(f)
                for row in csv_reader:
                    if row and row[0].strip():
                        names.append(row[0].strip())

        self.logger.info(f"Read {len(names)} computer names from {csv_file}")
        return names

    def get_computer_info_list(self, computer_names: List[str]) -> List[Dict[str, Any]]:
        """Get information for multiple computers."""
        results = []

        for i, name in enumerate(computer_names, 1):
            self.logger.info(f"Processing {i}/{len(computer_names)}: {name}")

            try:
                # Find computer
                computer = self.client.get_computer_by_name(name)
                if not computer:
                    self.logger.warning(f"Computer not found: {name}")
                    results.append({
                        "name": name,
                        "error": "Not found in ESET PROTECT",
                    })
                    continue

                # Get detailed info
                uuid = computer.get("uuid") or computer.get("computerUuid")
                if uuid:
                    details = self.client.get_computer_details(uuid)
                    if details:
                        computer.update(details)

                # Extract info
                info = ComputerInfoExtractor.extract_info(computer)
                results.append(info)

            except Exception as e:
                self.logger.error(f"Failed to get info for {name}: {e}")
                results.append({
                    "name": name,
                    "error": str(e),
                })

            # Avoid rate limiting
            if i < len(computer_names):
                time.sleep(0.5)

        return results

    def export_to_csv(self, results: List[Dict[str, Any]], output_file: Path):
        """Export results to CSV file."""
        if not results:
            self.logger.warning("No results to export")
            return

        # Get all unique keys
        fieldnames = set()
        for result in results:
            fieldnames.update(result.keys())
        fieldnames = sorted(fieldnames)

        with open(output_file, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)

        self.logger.info(f"Exported {len(results)} results to {output_file}")

    def execute_task(
        self,
        computer_names: List[str],
        task_type: str,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Execute task on multiple computers."""
        task_type_id = TASK_TYPES.get(task_type)
        if task_type_id is None:
            raise ValueError(f"Invalid task type: {task_type}. Valid: {list(TASK_TYPES.keys())}")

        # Get computer UUIDs
        uuids = []
        not_found = []

        for name in computer_names:
            computer = self.client.get_computer_by_name(name)
            if computer:
                uuid = computer.get("uuid") or computer.get("computerUuid")
                if uuid:
                    uuids.append(uuid)
                else:
                    not_found.append(name)
            else:
                not_found.append(name)

        if not_found:
            self.logger.warning(f"Computers not found: {', '.join(not_found)}")

        if not uuids:
            self.logger.error("No valid computers found for task execution")
            return []

        # Create task
        task_id = self.client.create_client_task(
            task_type=task_type_id,
            target_uuids=uuids,
            **kwargs
        )

        result = {
            "task_id": task_id,
            "task_type": task_type,
            "target_count": len(uuids),
            "targets": computer_names,
            "not_found": not_found,
        }

        if self.client.dry_run:
            self.logger.info(f"[DRY-RUN] Task created: {result}")
        else:
            self.logger.info(f"Task created: {task_id} for {len(uuids)} computers")

        return [result]


# ============================================================================
# CLI
# ============================================================================

def setup_logging(verbose: bool = False):
    """Setup logging configuration."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def main():
    parser = argparse.ArgumentParser(
        description="ESET PROTECT On-Prem 11.1 API Manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Get info for computers in CSV
  %(prog)s info --csv computers.csv --output results.csv

  # Install AV on specific computers (dry-run)
  %(prog)s task --csv computers.csv --type SoftwareInstallation --dry-run

  # Uninstall AV
  %(prog)s task --csv computers.csv --type SoftwareUninstallation

  # Run custom command
  %(prog)s task --csv computers.csv --type RunCommand --command "ipconfig /all"

Environment Variables:
  ESET_HOST          ESET server hostname/IP
  ESET_PORT          ESET server port (default: 2223)
  ESET_USERNAME      Username for authentication
  ESET_PASSWORD      Password for authentication
  ESET_VERIFY_SSL    Verify SSL certificates (default: true)
        """
    )

    parser.add_argument("-c", "--config", type=Path, help="Config file path (default: ~/.config/eset_manager/config.json)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    parser.add_argument("--dry-run", action="store_true", help="Dry-run mode (no actual API calls except login)")

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Info command
    info_parser = subparsers.add_parser("info", help="Get computer information")
    info_parser.add_argument("--csv", type=Path, required=True, help="Input CSV file with computer names")
    info_parser.add_argument("--output", type=Path, required=True, help="Output CSV file for results")

    # Task command
    task_parser = subparsers.add_parser("task", help="Execute task on computers")
    task_parser.add_argument("--csv", type=Path, required=True, help="Input CSV file with computer names")
    task_parser.add_argument("--type", required=True, choices=list(TASK_TYPES.keys()), help="Task type")
    task_parser.add_argument("--name", help="Task name (default: auto-generated)")
    task_parser.add_argument("--description", help="Task description")
    task_parser.add_argument("--command", help="Command to run (for RunCommand task type)")
    task_parser.add_argument("--output", type=Path, help="Output CSV file for results")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    setup_logging(args.verbose)
    logger = logging.getLogger("main")

    try:
        # Load config
        config = load_config(args.config)

        # Create client
        client = ESETAPIClient(config, dry_run=args.dry_run)

        # Login
        if not client.login():
            logger.error("Authentication failed")
            sys.exit(1)

        # Create manager
        manager = ESETManager(client)

        # Execute command
        if args.command == "info":
            computer_names = manager.read_computer_names_from_csv(args.csv)
            results = manager.get_computer_info_list(computer_names)
            manager.export_to_csv(results, args.output)

            # Summary
            connected = sum(1 for r in results if r.get("connected"))
            logger.info(f"Summary: {len(results)} total, {connected} connected")

        elif args.command == "task":
            computer_names = manager.read_computer_names_from_csv(args.csv)

            task_kwargs = {}
            if args.name:
                task_kwargs["taskName"] = args.name
            if args.description:
                task_kwargs["description"] = args.description
            if args.command and args.type == "RunCommand":
                task_kwargs["command"] = args.command

            results = manager.execute_task(computer_names, args.type, **task_kwargs)

            if args.output:
                manager.export_to_csv(results, args.output)

        logger.info("Completed successfully")

    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=args.verbose)
        sys.exit(1)


if __name__ == "__main__":
    main()
