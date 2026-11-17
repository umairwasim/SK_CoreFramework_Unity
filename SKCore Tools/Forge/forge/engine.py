"""FORGE — Unity CLI project scan, player builds, GitHub fetch, Telegram commands."""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shlex
import shutil
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import concurrent.futures
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
EDITOR_SCRIPT = ROOT / "editor" / "ForgeBuild.cs"

BUILD_RE = re.compile(
    r"""^
    /?build(?:@[\w]+)?\s+
    (?P<target>[A-Za-z][A-Za-z0-9_+-]{0,24})
    (?:\s+commit)?
    (?:\s+sha)?
    \s+
    (?P<sha>[0-9a-fA-F]{7,40})
    (?:\s+(?P<project>\S(?:.*\S)?))?
    \s*
    $""",
    re.I | re.X,
)

ALIASES = {
    "AOS": "Android",
    "ANDROID": "Android",
    "IOS": "iOS",
    "WIN": "StandaloneWindows64",
    "WINDOWS": "StandaloneWindows64",
    "WIN64": "StandaloneWindows64",
    "OSX": "StandaloneOSX",
    "MAC": "StandaloneOSX",
    "LINUX": "StandaloneLinux64",
    "WEB": "WebGL",
    "WEBGL": "WebGL",
}

TARGET_LABELS = {
    "Android": "Android",
    "iOS": "iOS",
    "StandaloneWindows64": "Windows",
    "StandaloneOSX": "macOS",
    "StandaloneLinux64": "Linux",
    "WebGL": "WebGL",
}

HELP = """🛠 FORGE Telegram Commands

• /status - Check current Forge status (Building / Idle / Queued)
• /build - Build Android APK from staging branch
• /build AOS [project] - Build Android APK for specified project
• /build AOS <sha> [project] - Build specific commit SHA
• /projects - List scanned local & GitHub Unity projects
• /builds - View recent build history & status
• /cancel - Stop/cancel active build job
• /pair <code> - Pair chat with FORGE UI
"""

SKIP_DIRS = {
    "library", "temp", "obj", "logs", "node_modules", ".git",
    "builds", "build", "user-settings", "usersettings", "_remotes",
    "worktrees", "clones", ".forge",
}

COVERS = {
    "northline": "/static/covers/northline.jpg",
    "harbor": "/static/covers/harbor.jpg",
    "kitefall": "/static/covers/kitefall.jpg",
}

STAGE_RULES = [
    (re.compile(r"resolving project", re.I), 8, "Resolving project"),
    (re.compile(r"resolving editor", re.I), 14, "Resolving editor"),
    (re.compile(r"starting unity|batchmode", re.I), 22, "Starting Unity"),
    (re.compile(r"licen[sc]", re.I), 28, "Checking license"),
    (re.compile(r"importing assets|asset import|hold on", re.I), 40, "Importing assets"),
    (re.compile(r"compil", re.I), 54, "Compiling scripts"),
    (re.compile(r"switching target|build target", re.I), 48, "Switching target"),
    (re.compile(r"building scene|building player|build player", re.I), 68, "Building player"),
    (re.compile(r"il2cpp", re.I), 78, "IL2CPP"),
    (re.compile(r"gradle", re.I), 86, "Gradle"),
    (re.compile(r"xcode", re.I), 86, "Xcode"),
    (re.compile(r"packag", re.I), 94, "Packaging"),
    (re.compile(r"build finished|result: success|result=succeeded|unity exited \(code 0\)", re.I), 100, "Finished"),
]


def _first_line(text: str) -> str:
    return (text or "").strip().splitlines()[0][:220]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def mask(token: str) -> str:
    if not token:
        return ""
    if len(token) < 10:
        return "••••"
    return token[:4] + "…" + token[-4:]


def quote_cmd(argv) -> str:
    return " ".join(shlex.quote(str(a)) for a in argv)


def safe_seg(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")[:80] or "repo"


class AmbiguousProject(Exception):
    def __init__(self, projects):
        self.projects = projects
        names = ", ".join(p["name"] for p in projects)
        super().__init__(names)


class Forge:
    def __init__(self, root: Path = ROOT):
        self.root = Path(root)
        self.data = self.root / "data"
        self.data.mkdir(parents=True, exist_ok=True)
        (self.data / "artifacts").mkdir(exist_ok=True)
        (self.data / "logs").mkdir(exist_ok=True)
        (self.data / "worktrees").mkdir(exist_ok=True)
        (self.data / "clones").mkdir(exist_ok=True)
        self.lock = threading.RLock()
        self.settings = self._load_settings()
        self.projects = []
        self.builds = self._load_builds()
        self.command_log = []
        self.scan = self._empty_scan()
        self.github_profile = self._load_json(self.data / "github-profile.json", {})
        self.install = {"running": False, "log": [], "error": None, "finishedAt": None}
        self.queue = __import__("queue").Queue()
        self.tg_stop = False
        self.tg_thread = None
        self.tg_offset = 0
        self.tg_error = None
        self._scan_lock = threading.Lock()
        threading.Thread(target=self._build_loop, name="forge-build", daemon=True).start()
        if self.settings.get("github_token"):
            threading.Thread(target=self.refresh_github, name="forge-gh", daemon=True).start()
        if self.settings.get("telegram_token"):
            self.start_telegram()
        self.start_scan()

    # ---------- persistence ----------

    def _load_json(self, path: Path, default):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return default

    def _save_json(self, path: Path, obj, mode=0o600):
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, indent=2), encoding="utf-8")
        os.chmod(tmp, mode)
        tmp.replace(path)

    def _load_settings(self):
        raw = self._load_json(self.data / "settings.json", {})
        settings = {
            "unity_bin": "",
            "scan_roots": [],
            "default_project_id": "",
            "simulate_if_missing": True,
            "inject_build_script": True,
            "output_dir": str(self.data / "artifacts"),
            "github_token": "",
            "telegram_token": "",
            "telegram_chats": [],
            "pair_code": f"{secrets.randbelow(900000) + 100000}",
            "android_export": "apk",
            "links": {},
            "extra_projects": [],
        }
        settings.update({k: v for k, v in raw.items() if k in settings or k == "links"})
        if not settings.get("pair_code"):
            settings["pair_code"] = f"{secrets.randbelow(900000) + 100000}"
        self._save_json(self.data / "settings.json", settings)
        return settings

    def save_settings(self):
        self._save_json(self.data / "settings.json", self.settings)

    def _load_builds(self):
        builds = self._load_json(self.data / "builds.json", [])
        for build in builds:
            if build.get("status") in ("running", "queued"):
                build["status"] = "interrupted"
                build["error"] = "Server restarted before this build finished."
                build["finishedAt"] = build.get("finishedAt") or now_iso()
        return builds

    def save_builds(self):
        slim = []
        for build in self.builds[:40]:
            item = {k: v for k, v in build.items() if k not in ("log",)}
            item["logTail"] = (build.get("log") or [])[-20:]
            slim.append(item)
        self._save_json(self.data / "builds.json", slim, mode=0o644)

    # ---------- scan ----------

    def _empty_scan(self):
        return {
            "running": False,
            "percent": 0,
            "stage": "Waiting to open",
            "detail": "",
            "command": "",
            "transcript": [],
            "error": None,
            "cliAvailable": False,
            "cliVersion": None,
            "cliPath": None,
            "commandUsed": None,
            "fallback": None,
            "startedAt": None,
            "finishedAt": None,
            "projectCount": 0,
            "editors": [],
        }

    def start_scan(self):
        if not self._scan_lock.acquire(blocking=False):
            return False
        threading.Thread(target=self._scan_worker, name="forge-scan", daemon=True).start()
        return True

    def _pace(self, percent: float):
        target = (percent / 100.0) * 2.05
        delay = target - (time.time() - self._scan_t0)
        if delay > 0:
            time.sleep(delay)

    def _stage(self, percent, label, detail=""):
        with self.lock:
            self.scan["percent"] = percent
            self.scan["stage"] = label
            self.scan["detail"] = detail
        self._pace(percent)

    def _transcript(self, line: str):
        with self.lock:
            self.scan["transcript"].append(line)
            self.scan["transcript"] = self.scan["transcript"][-40:]
            self.scan["command"] = line

    def _scan_worker(self):
        self._scan_t0 = time.time()
        with self.lock:
            self.scan = self._empty_scan()
            self.scan["running"] = True
            self.scan["startedAt"] = now_iso()
        try:
            self._stage(8, "Locating Unity CLI", "Looking for the unity binary")
            unity = self.locate_unity()
            editors = self.find_editors()
            with self.lock:
                self.scan["cliPath"] = unity
                self.scan["cliAvailable"] = bool(unity)
                self.scan["editors"] = editors

            projects = []
            used = None
            if unity:
                self._stage(18, "Reading Unity CLI version", unity)
                version = self._unity_version(unity)
                with self.lock:
                    self.scan["cliVersion"] = version
                self._transcript(f"$ {shlex.quote(unity)} --version")
                self._transcript(version or "no version string")

                self._stage(36, "unity --projects", "Asking Unity CLI for registered projects")
                cmd = [unity, "--projects", "--format", "json", "--no-pager", "--non-interactive", "--no-banner", "--no-color"]
                self._transcript("$ " + quote_cmd(cmd))
                found, err = self._run_list_command(cmd)
                if found is not None:
                    projects = found
                    used = "unity --projects"
                    self._transcript(f"→ {len(found)} project(s) from unity --projects")
                else:
                    self._transcript("→ " + _first_line(err or "unity --projects did not return a project list"))
                    self._stage(52, "unity projects list", "Canonical Unity CLI project list")
                    cmd = [unity, "projects", "list", "--format", "json", "--no-pager", "--non-interactive", "--no-banner", "--no-color"]
                    self._transcript("$ " + quote_cmd(cmd))
                    found, err = self._run_list_command(cmd)
                    if found is not None:
                        projects = found
                        used = "unity projects list"
                        self._transcript(f"→ {len(found)} project(s) from unity projects list")
                    else:
                        self._transcript("→ " + (err or "unity projects list failed"))
                        with self.lock:
                            self.scan["error"] = err
            else:
                self._stage(24, "unity --projects", "Asking Unity CLI for registered projects")
                self._transcript("$ unity --projects --format json --no-pager --non-interactive --no-banner")
                self._transcript("→ Unity CLI binary not found")
                self._stage(46, "unity projects list", "Canonical Unity CLI project list")
                self._transcript("$ unity projects list --format json --no-pager --non-interactive --no-banner")
                self._transcript("→ skipped, unity is not on PATH")
                with self.lock:
                    self.scan["error"] = "Unity CLI was not found. Install it, or set the binary path in Settings."

            self._stage(66, "Reading Unity Hub registry", "projects-v1.json")
            hub = self._hub_projects()
            self._transcript(f"→ Hub registry: {len(hub)} project(s)")

            self._stage(78, "Scanning project folders", ", ".join(self.scan_roots()) or "no roots")
            folders = self._folder_scan()
            self._transcript(f"→ Folder scan: {len(folders)} project(s)")

            merged = self._merge_projects(projects, hub, folders)
            if used:
                for item in merged:
                    if item.get("fromCli"):
                        item["source"] = "unity-cli"
            fallback = None if projects else ("hub" if hub else "folder" if folders else "none")

            self._stage(90, "Reading ProjectSettings and git", f"{len(merged)} path(s)")
            enriched = []
            for item in merged:
                try:
                    enriched.append(self._enrich(item))
                except Exception as exc:
                    self._transcript(f"→ skipped {item.get('path')}: {exc}")

            if self.settings.get("github_token"):
                self._stage(95, "Syncing GitHub repositories", "Connecting to GitHub API")
                enriched = self._merge_github_repos(enriched)

            enriched.sort(key=lambda p: (not p.get("favorite"), p["name"].lower()))

            with self.lock:
                self.projects = enriched
                self.scan["commandUsed"] = used
                self.scan["fallback"] = fallback
                self.scan["projectCount"] = len(enriched)
                self.scan["cliAvailable"] = bool(unity)
            self._stage(100, "Projects ready", f"{len(enriched)} project(s)")
            self._transcript(f"→ ready, {len(enriched)} project(s)")
        except Exception as exc:
            with self.lock:
                self.scan["error"] = str(exc)
            self._transcript("→ scan failed: " + str(exc))
        finally:
            with self.lock:
                self.scan["running"] = False
                self.scan["finishedAt"] = now_iso()
                self.scan["percent"] = 100
            self._scan_lock.release()

    def locate_unity(self):
        candidates = []
        configured = (self.settings.get("unity_bin") or "").strip()
        if configured:
            candidates.append(configured)
        for name in ("unity", "Unity"):
            found = shutil.which(name)
            if found:
                candidates.append(found)
        home = Path.home()
        candidates.extend([
            str(home / ".local/bin/unity"),
            str(home / ".unity/bin/unity"),
            "/usr/local/bin/unity",
            "/opt/unity/bin/unity",
        ])
        seen = set()
        for candidate in candidates:
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            path = Path(candidate)
            if path.is_file() and os.access(path, os.X_OK):
                return str(path)
        return None

    def find_editors(self):
        home = Path.home()
        roots = [
            home / "Unity/Hub/Editor",
            home / "Unity/Hub/Editor".replace("Unity", "unity"),
            Path("/opt/unity/editors"),
            Path("/Applications/Unity/Hub/Editor"),
        ]
        appdata = os.environ.get("PROGRAMFILES", "")
        if appdata:
            roots.append(Path(appdata) / "Unity/Hub/Editor")
        found = []
        for root in roots:
            if not root.is_dir():
                continue
            try:
                children = list(root.iterdir())
            except OSError:
                continue
            for child in children:
                for rel in (
                    Path("Editor") / "Unity",
                    Path("Unity.app") / "Contents" / "MacOS" / "Unity",
                    Path("Editor") / "Unity.exe",
                ):
                    binary = child / rel
                    if binary.is_file():
                        found.append({"version": child.name, "path": str(binary)})
                        break
        return found

    def match_editor(self, version: str | None):
        editors = self.find_editors()
        if not editors:
            return None
        if version:
            for editor in editors:
                if editor["version"] == version or version.startswith(editor["version"]):
                    return editor["path"]
        return editors[0]["path"]

    def _unity_version(self, unity: str) -> str:
        try:
            proc = subprocess.run(
                [unity, "--version"],
                capture_output=True, text=True, timeout=20,
                env=self._unity_env(),
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return str(exc)
        text = (proc.stdout or proc.stderr or "").strip()
        return text.splitlines()[0] if text else ""

    def _unity_env(self):
        env = os.environ.copy()
        env["UNITY_NO_PAGER"] = "1"
        env["UNITY_NON_INTERACTIVE"] = "1"
        env["NO_COLOR"] = "1"
        return env

    def _run_list_command(self, cmd):
        try:
            proc = subprocess.run(
                cmd, capture_output=True, text=True, timeout=45, env=self._unity_env(),
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return None, str(exc)
        parsed = parse_project_payload(proc.stdout)
        if parsed is None:
            err = (proc.stderr or proc.stdout or f"exit {proc.returncode}").strip()
            return None, err[:500]
        if isinstance(parsed, dict) and parsed.get("success") is False:
            errors = parsed.get("errors") or []
            msg = errors[0].get("message") if errors and isinstance(errors[0], dict) else "Unity CLI returned success=false"
            return None, str(msg)[:500]
        return projects_from_payload(parsed), None

    def scan_roots(self):
        home = Path.home()
        roots = [
            home / "UnityProjects",
            home / "Unity" / "Projects",
            home / "Documents" / "Unity Projects",
            home / "Documents" / "UnityProjects",
            home / "Projects",
        ]
        for extra in self.settings.get("scan_roots") or []:
            if extra:
                roots.append(Path(extra).expanduser())
        unique = []
        seen = set()
        for root in roots:
            try:
                key = str(root.resolve()) if root.exists() else str(root)
            except OSError:
                key = str(root)
            if key in seen:
                continue
            seen.add(key)
            if root.is_dir():
                unique.append(str(root))
        return unique

    def _hub_projects(self):
        home = Path.home()
        paths = [
            home / ".config/UnityHub/projects-v1.json",
            home / ".config/unityhub/projects-v1.json",
            home / ".config/unityhub/projects.json",
            home / "Library/Application Support/UnityHub/projects-v1.json",
        ]
        appdata = os.environ.get("APPDATA")
        if appdata:
            paths.append(Path(appdata) / "UnityHub/projects-v1.json")
        projects = []
        for path in paths:
            if not path.is_file():
                continue
            self._transcript(f"$ read {path}")
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                self._transcript(f"→ {path.name}: {exc}")
                continue
            for item in projects_from_payload(payload):
                item["source"] = "hub"
                projects.append(item)
        return projects

    def _folder_scan(self):
        found = []
        for root in self.scan_roots():
            found.extend(self._scan_tree(Path(root), 0))
        for extra in self.settings.get("extra_projects") or []:
            path = Path(extra)
            if (path / "ProjectSettings" / "ProjectVersion.txt").is_file():
                found.append({"path": str(path), "title": path.name, "source": "folder"})
        return found

    def _scan_tree(self, directory: Path, depth: int):
        found = []
        marker = directory / "ProjectSettings" / "ProjectVersion.txt"
        if marker.is_file():
            found.append({"path": str(directory), "title": directory.name, "source": "folder"})
            return found
        if depth >= 3:
            return found
        try:
            children = list(directory.iterdir())
        except OSError:
            return found
        for child in children:
            if not child.is_dir():
                continue
            if child.name.lower() in SKIP_DIRS or child.name.startswith("."):
                continue
            found.extend(self._scan_tree(child, depth + 1))
        return found

    def _merge_projects(self, cli_projects, hub_projects, folder_projects):
        by = {}
        for source_name, items in (("folder", folder_projects), ("hub", hub_projects), ("unity-cli", cli_projects)):
            for item in items:
                raw = item.get("path")
                if not raw:
                    continue
                try:
                    key = str(Path(raw).resolve())
                except OSError:
                    key = raw
                current = by.get(key, {})
                current.update({k: v for k, v in item.items() if v not in (None, "")})
                current["path"] = key
                current["source"] = source_name
                if source_name == "unity-cli":
                    current["fromCli"] = True
                by[key] = current
        return list(by.values())

    def _merge_github_repos(self, enriched):
        if not self.settings.get("github_token"):
            return enriched
        try:
            gh_repos = self.github_repos()
            self._transcript(f"→ GitHub API: {len(gh_repos)} repo(s) fetched")
        except Exception as exc:
            self._transcript(f"→ GitHub repos list failed: {exc}")
            return enriched

        matched_keys = set()
        for p in enriched:
            git = p.get("git") or {}
            gh_info = git.get("github")
            if gh_info:
                key = (gh_info["owner"].lower(), gh_info["repo"].lower())
                for repo in gh_repos:
                    if (repo["owner"].lower(), repo["name"].lower()) == key:
                        p["github"] = repo
                        matched_keys.add(key)
                        break

        for repo in gh_repos:
            key = (repo["owner"].lower(), repo["name"].lower())
            if key in matched_keys:
                continue
            if any(p["name"].lower() == repo["name"].lower() for p in enriched):
                continue

            full_name = repo["fullName"]
            pid = hashlib.sha1(f"github:{full_name}".encode()).hexdigest()[:12]
            enriched.append({
                "id": pid,
                "name": repo["name"],
                "path": f"github.com/{full_name}",
                "version": "GitHub Remote",
                "source": "github",
                "remoteOnly": True,
                "sample": False,
                "favorite": False,
                "scenes": [],
                "sceneCount": 0,
                "cover": COVERS.get(repo["name"].lower()),
                "git": {
                    "branch": "staging",
                    "sha": "",
                    "short": "remote",
                    "subject": f"GitHub Repository {full_name}",
                    "remote": f"https://github.com/{full_name}.git",
                    "github": {"owner": repo["owner"], "repo": repo["name"]},
                },
                "github": repo,
                "modifiedAt": repo.get("updatedAt"),
                "architecture": "",
            })
        return enriched

    def _enrich(self, item):
        path = Path(item["path"])
        version = read_text_field(path / "ProjectSettings" / "ProjectVersion.txt", r"^m_EditorVersion:\s*(.+)$")
        product = read_text_field(path / "ProjectSettings" / "ProjectSettings.asset", r"^\s*productName:\s*(.+)$")
        name = (product or item.get("title") or path.name).strip()
        scenes = [str(p.relative_to(path)) for p in path.glob("Assets/**/*.unity")]
        git = self.git_info(path)
        real = str(path.resolve())
        pid = hashlib.sha1(real.encode()).hexdigest()[:12]
        cover = COVERS.get(path.name.lower()) or COVERS.get(name.lower().replace(" ", ""))
        modified = None
        version_file = path / "ProjectSettings" / "ProjectVersion.txt"
        if version_file.is_file():
            modified = datetime.fromtimestamp(version_file.stat().st_mtime, timezone.utc).isoformat()
        return {
            "id": pid,
            "name": name,
            "path": real,
            "version": version or item.get("version") or "",
            "source": "unity-cli" if item.get("fromCli") else item.get("source") or "folder",
            "sample": (path / ".forge-sample").is_file(),
            "favorite": bool(item.get("favorite") or item.get("isFavorite")),
            "scenes": scenes[:12],
            "sceneCount": len(scenes),
            "cover": cover,
            "git": git,
            "modifiedAt": modified,
            "architecture": item.get("architecture") or "",
        }

    def git_info(self, path: Path):
        probe = self.git(path, ["rev-parse", "--is-inside-work-tree"], timeout=8)
        if probe.returncode != 0 or probe.stdout.strip() != "true":
            return None
        sha = self.git(path, ["rev-parse", "HEAD"], timeout=8).stdout.strip()
        branch = self.git(path, ["rev-parse", "--abbrev-ref", "HEAD"], timeout=8).stdout.strip()
        subject = self.git(path, ["log", "-1", "--format=%s"], timeout=8).stdout.strip()
        when = self.git(path, ["log", "-1", "--format=%cI"], timeout=8).stdout.strip()
        dirty = bool(self.git(path, ["status", "--porcelain"], timeout=8).stdout.strip())
        remote = self.git(path, ["remote", "get-url", "origin"], timeout=8).stdout.strip()
        github = parse_github_remote(remote) if remote else None
        return {
            "branch": branch,
            "sha": sha,
            "short": sha[:7] if sha else "",
            "subject": subject,
            "dirty": dirty,
            "remote": remote,
            "github": {"owner": github[0], "repo": github[1]} if github else None,
            "committedAt": when,
        }

    def commits_for(self, project_id: str, limit: int = 12):
        project = self.project_by_id(project_id)
        if not project:
            raise KeyError("Unknown project")
        if not project.get("git"):
            return []
        # Prefer staging branch — try origin/staging → staging → HEAD
        ref = self._staging_ref(project["path"])
        result = self.git(
            project["path"],
            ["log", f"-n{limit}", ref, "--format=%H%x1f%h%x1f%s%x1f%cI%x1f%an"],
            timeout=15,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "git log failed")
        commits = []
        for line in result.stdout.splitlines():
            parts = line.split("\x1f")
            if len(parts) < 5:
                continue
            commits.append({
                "sha": parts[0],
                "short": parts[1],
                "subject": parts[2],
                "date": parts[3],
                "author": parts[4],
            })
        return commits

    def _staging_ref(self, project_path) -> str:
        """Return the best available staging ref: origin/staging > staging > releases/staging > HEAD."""
        for ref in ("origin/staging", "staging", "releases/staging", "origin/releases/staging"):
            probe = self.git(project_path, ["rev-parse", "--verify", ref], timeout=8)
            if probe.returncode == 0:
                return ref
        return "HEAD"

    def github_staging_commit(self, owner: str, repo: str):
        """Fetch latest commit from staging or default branch via GitHub API."""
        for branch in ("staging", "releases/staging", "main", "master"):
            path = f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/commits?sha={branch}&per_page=1"
            status, data = self.gh("GET", path)
            if status == 200 and isinstance(data, list) and len(data) > 0:
                item = data[0]
                commit = item.get("commit") or {}
                msg = (commit.get("message") or "").splitlines()
                return item.get("sha"), msg[0] if msg else ""
        return None, None

    def _resolve_staging_or_head(self, project):
        """Resolve target build SHA prioritizing staging branch (local/remote), then HEAD."""
        path_str = project.get("path")
        if path_str and Path(path_str).exists() and project.get("git"):
            path = Path(path_str)
            self.git(path, ["fetch", "origin", "staging"], timeout=8)
            ref = self._staging_ref(path)
            probe = self.git(path, ["rev-parse", ref], timeout=8)
            if probe.returncode == 0:
                sha = probe.stdout.strip()
                subject = self._subject(path, sha)
                return sha, subject

        gh = project.get("github") or (project.get("git") or {}).get("github")
        if gh and self.settings.get("github_token"):
            owner, repo_name = gh["owner"], gh["repo"]
            sha, subject = self.github_staging_commit(owner, repo_name)
            if sha:
                return sha, subject

        git = project.get("git") or {}
        return git.get("sha"), git.get("subject")

    def add_project_path(self, raw: str):
        path = Path(raw).expanduser()
        try:
            path = path.resolve()
        except OSError as exc:
            raise RuntimeError(str(exc)) from exc
        if not (path / "ProjectSettings" / "ProjectVersion.txt").is_file():
            raise RuntimeError("That folder is not a Unity project (missing ProjectSettings/ProjectVersion.txt).")
        extras = list(self.settings.get("extra_projects") or [])
        if str(path) not in extras:
            extras.append(str(path))
            self.settings["extra_projects"] = extras
            self.save_settings()
        return str(path)

    # ---------- commands ----------

    def handle_command(self, text: str, source: str = "ui", chat_id=None):
        raw = (text or "").strip()
        if not raw:
            return {"ok": False, "reply": "Type a command. Try HELP.", "buildId": None}
        if source == "telegram" and not self._chat_allowed(chat_id) and not self._is_pair_or_help(raw):
            reply = "This chat is not paired. Open FORGE → Telegram and send /pair and the code shown there."
            entry = self._log_command(source, raw, reply, chat_id, None)
            return {"ok": False, "reply": reply, "buildId": None, "entry": entry}

        try:
            reply, build_id, ok = self._dispatch(raw, source, chat_id)
        except AmbiguousProject as exc:
            names = "\n".join(f"BUILD AOS <sha> {p['name']}" for p in exc.projects)
            reply = "More than one project matches. Name one:\n" + "\n".join(p["name"] for p in exc.projects)
            ok = False
            build_id = None
        except Exception as exc:
            reply = str(exc)
            ok = False
            build_id = None
        entry = self._log_command(source, raw, reply, chat_id, build_id)
        return {"ok": ok, "reply": reply, "buildId": build_id, "entry": entry}

    def _is_pair_or_help(self, text: str) -> bool:
        low = re.sub(r"^/(\w+)@\w+", r"/\1", text.strip()).lower()
        return low in ("/start", "start", "/help", "help", "help me") or low.startswith("/pair") or low.startswith("pair ")

    def _chat_allowed(self, chat_id) -> bool:
        if chat_id is None:
            return True
        allowed = {str(c) for c in self.settings.get("telegram_chats") or []}
        return str(chat_id) in allowed

    def _dispatch(self, raw: str, source: str, chat_id):
        text = re.sub(r"^/(\w+)@\w+", r"/\1", raw.strip())
        low = text.lower()
        if low in ("/start", "start", "/help", "help", "help me"):
            return HELP, None, True
        pair = re.match(r"^/?pair(?:@\w+)?\s+(\d{4,8})$", text, re.I)
        if pair:
            return self._pair(pair.group(1), chat_id), None, True
        if low in ("projects", "/projects", "project", "/project"):
            return self._cmd_projects(), None, True
        if low in ("status", "/status", "state", "/state"):
            return self._cmd_status(), None, True
        if low in ("builds", "/builds", "history", "/history"):
            return self._cmd_builds_list(), None, True
        if low in ("cancel", "/cancel", "stop", "/stop"):
            return self._cmd_cancel(), None, True
        match = BUILD_RE.match(text)
        if match:
            reply, build_id = self._cmd_build(
                match.group("target"), match.group("sha"), match.group("project"), source, chat_id,
            )
            return reply, build_id, True

        # Catch-all for build without explicit SHA (e.g. /build, BUILD, /build AOS, BUILD AOS project_name)
        build_simple = re.match(r"^/?build(?:@\w+)?(?:\s+(?P<target>[A-Za-z0-9_+-]{1,24}))?(?:\s+(?P<project>\S(?:.*\S)?))?$", text, re.I)
        if build_simple:
            target_arg = build_simple.group("target")
            project_arg = build_simple.group("project")

            target_alias = "AOS"
            if target_arg:
                target_upper = target_arg.upper()
                if target_upper in ALIASES:
                    target_alias = target_upper
                else:
                    if project_arg:
                        project_arg = f"{target_arg} {project_arg}"
                    else:
                        project_arg = target_arg

            reply, build_id = self._cmd_build(
                target_alias, None, project_arg, source, chat_id
            )
            return reply, build_id, True

        return "I don't know that command. Send HELP or /help.", None, False

    def _pair(self, code: str, chat_id):
        if chat_id is None:
            return "Pairing is for Telegram. The window already talks to FORGE directly."
        if code != str(self.settings.get("pair_code")):
            return "That pair code does not match the one in the FORGE window."
        chats = [str(c) for c in self.settings.get("telegram_chats") or []]
        if str(chat_id) not in chats:
            chats.append(str(chat_id))
            self.settings["telegram_chats"] = chats
            self.save_settings()
        return "Paired ✅. You can now send /status, /build, or /projects to FORGE!"

    def _cmd_projects(self):
        if not self.projects:
            return "No projects scanned yet. Open FORGE UI to trigger scan."
        lines = [f"📂 Scanned Projects ({len(self.projects)}):"]
        for project in self.projects:
            git = project.get("git") or {}
            branch_info = f"branch: {git.get('branch') or 'main'}" if git.get("branch") else "local"
            sha_info = f"`{git.get('short')}`" if git.get("short") else ""
            lines.append(f"• *{project['name']}*\n  Editor: {project.get('version') or '6000.x'} | {branch_info} {sha_info}")
        return "\n\n".join(lines)

    def _cmd_status(self):
        active = [b for b in self.builds if b.get("status") in ("running", "queued")]
        if not active:
            last = next((b for b in self.builds if b.get("status") not in ("queued",)), None)
            lines = [
                "🟢 FORGE Status: IDLE (Hazırda bekliyor)",
                f"• Tarandığı Proje Sayısı: {len(self.projects)}",
                f"• Telegram Bağlantısı: Aktif ✅",
            ]
            if last:
                lines.append(f"• Son Build: {last.get('projectName')} ({last.get('targetAlias')}) — Durum: {last.get('status')} ({last.get('stage')})")
            lines.append("\nYeni build başlatmak için /build yazabilirsin.")
            return "\n".join(lines)

        lines = [f"🚀 FORGE Status: BUILDING ({len(active)} aktif işlem)"]
        for build in active:
            status_icon = "⏳" if build.get("status") == "queued" else "🔨"
            lines.append(
                f"{status_icon} Proje: {build.get('projectName') or 'Belirtilmedi'}\n"
                f"   Hedef: {build.get('targetAlias')} ({build.get('target')})\n"
                f"   Aşama: {build.get('stage')} ({int(build.get('percent') or 0)}%)\n"
                f"   SHA: {build.get('shortSha') or 'staging/HEAD'}"
            )
        return "\n\n".join(lines)

    def _cmd_builds_list(self):
        if not self.builds:
            return "No build history."
        lines = ["📜 Recent Build History:"]
        for build in self.builds[:6]:
            icon = {"succeeded": "✅", "failed": "❌", "cancelled": "🛑", "running": "🔨", "queued": "⏳"}.get(build.get("status"), "ℹ️")
            lines.append(f"{icon} {build.get('projectName')} [{build.get('targetAlias')}] - {build.get('status')} ({build.get('stage')})")
        return "\n".join(lines)

    def _cmd_cancel(self):
        active = next((b for b in self.builds if b.get("status") == "running"), None)
        if not active:
            queued = next((b for b in self.builds if b.get("status") == "queued"), None)
            if not queued:
                return "Nothing is building."
            self.cancel_build(queued["id"])
            return f"Cancelled queued build {queued.get('projectName')} {queued.get('targetAlias')}."
        self.cancel_build(active["id"])
        return f"Cancelling {active.get('projectName')} {active.get('targetAlias')}."

    def _cmd_build(self, alias: str, sha: str, project_name: str | None, source: str, chat_id):
        if not self.projects:
            raise RuntimeError("No Unity projects are loaded. Rescan first.")
        build = self.enqueue_build(
            project_id=None,
            project_name=project_name,
            target_alias=alias,
            sha=sha,
            source=source,
            chat_id=chat_id,
        )
        return self._start_reply(build), build["id"]

    def _start_reply(self, build):
        where = build.get("shortSha") or "current checkout"
        lines = [
            f"FORGE · {build.get('projectName') or 'finding project'} · {build.get('targetAlias')}",
            f"{build.get('target')} · {where}",
        ]
        if build.get("commitSubject"):
            lines.append(build["commitSubject"])
        if build.get("status") == "queued" and self._active_count() > 1:
            lines.append("Queued behind the build already running.")
        elif build.get("mode") == "dry-run":
            lines.append("Unity CLI is not installed here. I will dry-run the pipeline and show progress.")
        else:
            lines.append("Fetching that commit, then starting Unity CLI.")
        return "\n".join(lines)

    def _log_command(self, source, text, reply, chat_id, build_id):
        entry = {
            "id": "c" + secrets.token_hex(4),
            "at": now_iso(),
            "source": source,
            "chatId": chat_id,
            "text": text,
            "reply": reply,
            "buildId": build_id,
        }
        with self.lock:
            self.command_log.insert(0, entry)
            self.command_log = self.command_log[:80]
        return entry

    # ---------- builds ----------

    def enqueue_build(self, *, project_id=None, project_name=None, target_alias="AOS", sha=None, source="ui", chat_id=None):
        alias = (target_alias or "AOS").upper()
        if alias not in ALIASES:
            known = ", ".join(sorted(ALIASES))
            raise RuntimeError(f"Unknown target {target_alias}. Use one of: {known}. AOS means Android.")
        target = ALIASES[alias]
        if project_id and not project_name:
            existing = self.project_by_id(project_id)
            if existing:
                project_name = existing["name"]
        mode = "unity" if (self.locate_unity() or self.match_editor(None)) else "dry-run"
        if mode == "dry-run" and not self.settings.get("simulate_if_missing", True):
            raise RuntimeError("Unity CLI is not installed, and dry-run is turned off in Settings.")
        build = {
            "id": "b" + secrets.token_hex(5),
            "projectId": project_id,
            "projectName": project_name or "",
            "projectPath": "",
            "worktree": None,
            "targetAlias": alias,
            "target": target,
            "sha": sha,
            "shortSha": (sha or "")[:7],
            "commitSubject": "",
            "source": source,
            "chatId": chat_id,
            "status": "queued",
            "mode": mode,
            "simulated": False,
            "percent": 0,
            "stage": "Queued",
            "message": "",
            "phases": self._phases(bool(sha)),
            "command": "",
            "logFile": str(self.data / "logs" / f"b-pending.log"),
            "outputPath": "",
            "error": None,
            "createdAt": now_iso(),
            "startedAt": None,
            "finishedAt": None,
            "log": [],
            "telegramMessageId": None,
            "cancel": False,
            "pid": None,
            "artifactSize": None,
        }
        with self.lock:
            self.builds.insert(0, build)
            self.builds = self.builds[:40]
        self.save_builds()
        self.queue.put(build["id"])
        if source == "telegram" and chat_id is not None:
            try:
                build["telegramMessageId"] = self.tg_send(chat_id, self._start_reply(build))
            except Exception as exc:
                self.tg_error = str(exc)
        return build

    def _phases(self, with_commit: bool):
        if with_commit:
            items = [
                ("resolve", "Find commit"),
                ("fetch", "Fetch"),
                ("checkout", "Checkout worktree"),
                ("prepare", "Prepare build method"),
                ("unity", "Unity CLI"),
                ("package", "Package"),
            ]
        else:
            items = [
                ("resolve", "Current checkout"),
                ("prepare", "Prepare build method"),
                ("unity", "Unity CLI"),
                ("package", "Package"),
            ]
        return [{"id": pid, "label": label, "state": "wait"} for pid, label in items]

    def _active_count(self):
        return sum(1 for b in self.builds if b.get("status") in ("queued", "running"))

    def cancel_build(self, build_id: str):
        build = self.build_by_id(build_id)
        if not build:
            raise KeyError("Unknown build")
        build["cancel"] = True
        if build.get("status") == "queued":
            build["status"] = "cancelled"
            build["stage"] = "Cancelled"
            build["finishedAt"] = now_iso()
            self.save_builds()
            return build
        pid = build.get("pid")
        if pid:
            try:
                os.killpg(pid, signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                pass
        return build

    def _build_loop(self):
        while True:
            build_id = self.queue.get()
            build = self.build_by_id(build_id)
            if not build or build.get("status") == "cancelled":
                continue
            try:
                self._run_build(build)
            except Exception as exc:
                self._finish(build, "failed", str(exc))

    def _run_build(self, build):
        if build.get("cancel"):
            self._finish(build, "cancelled", "Cancelled before start.")
            return
        build["status"] = "running"
        build["startedAt"] = now_iso()
        build["stage"] = "Finding project"
        build["percent"] = 4
        self._phase(build, "resolve", "run")
        self._touch(build)

        project, full_sha, subject = self._resolve_for_build(build)
        build["projectId"] = project["id"]
        build["projectName"] = project["name"]
        build["projectPath"] = project["path"]
        build["sha"] = full_sha or build.get("sha")
        build["shortSha"] = (full_sha or build.get("sha") or project.get("git", {}).get("short") or "HEAD")[:7]
        build["commitSubject"] = subject or (project.get("git") or {}).get("subject") or ""
        self._phase(build, "resolve", "done")
        self._log_line(build, f"Project {project['name']} · {project['path']}")

        work_path = project["path"]
        worktree = None
        if build.get("sha"):
            self._phase(build, "fetch", "run")
            build["stage"] = "Fetching commit"
            build["percent"] = 10
            self._touch(build)
            full = self.ensure_commit(project, build["sha"])
            if not full:
                raise RuntimeError(self._missing_commit_message(build["sha"], project))
            build["sha"] = full
            build["shortSha"] = full[:7]
            self._phase(build, "fetch", "done")
            self._phase(build, "checkout", "run")
            build["stage"] = "Checking out worktree"
            build["percent"] = 16
            self._touch(build)
            worktree = self.data / "worktrees" / build["id"]
            self._log_line(build, f"git worktree add --detach {worktree} {full[:12]}")
            self.add_worktree(project["path"], full, worktree)
            work_path = str(worktree)
            build["worktree"] = work_path
            self._phase(build, "checkout", "done")
            self._log_line(build, "Worktree ready. Your open Editor checkout was not moved.")
        else:
            git = project.get("git") or {}
            if git.get("dirty"):
                self._log_line(build, "Working tree is dirty. Building the current files, not a clean commit.")
            self._phase(build, "resolve", "done")

        self._phase(build, "prepare", "run")
        build["stage"] = "Preparing build method"
        build["percent"] = 20
        # Use AndroidCLIBuilder from the project — no script injection needed
        build_method = "AndroidCLIBuilder.BuildAPKWithProfile"
        self._log_line(build, f"Build method {build_method}")
        output = self.artifact_path(project, build)
        build["outputPath"] = output
        log_file = self.data / "logs" / f"{build['id']}.log"
        build["logFile"] = str(log_file)

        self._phase(build, "prepare", "done")

        argv, kind = self.build_argv(work_path, project, build, output, log_file)
        hypothetical = self.hypothetical_cli(work_path, build, output, log_file)
        build["command"] = quote_cmd(argv or hypothetical)
        self._log_line(build, "$ " + build["command"])
        self._phase(build, "unity", "run")
        build["stage"] = "Unity CLI" if kind != "dry-run" else "Dry run"
        build["percent"] = 24
        self._touch(build)

        try:
            if kind == "dry-run":
                build["simulated"] = True
                build["mode"] = "dry-run"
                self._simulate(build, log_file)
                if build.get("cancel"):
                    self._finish(build, "cancelled", "Cancelled during dry run.")
                    return
                self._phase(build, "unity", "done")
                self._phase(build, "package", "done")
                self._finish(build, "dry_run", "Unity CLI is not installed, so no player was produced. The pipeline and progress view ran against the resolved commit.")
                return

            code = self._stream_build(build, argv, log_file)
            if build.get("cancel"):
                self._finish(build, "cancelled", "Cancelled.")
                return
            failed, cli_message = cli_reported_failure(build.get("log") or [])
            tail = "\n".join(build.get("log") or [])
            log_failed = bool(re.search(r"Build Finished, Result: Failure|FORGE: Build failed|error CS\d+", tail))
            if failed or log_failed or code not in (0, None):
                reason = cli_message or self._error_excerpt(build) or f"Unity CLI exited {code}."
                editor_missing = bool(re.search(r"not installed|no editor|editor .* missing", reason, re.I))
                if editor_missing and self.settings.get("simulate_if_missing", True) and not build.get("cancel"):
                    self._log_line(build, "Unity CLI: " + reason)
                    self._log_line(build, "The editor for this project is not installed, so no player can be produced. Showing the progress stream the build would emit.")
                    build["simulated"] = True
                    build["mode"] = "dry-run"
                    self._simulate(build, log_file)
                    if build.get("cancel"):
                        self._finish(build, "cancelled", "Cancelled during dry run.")
                        return
                    self._phase(build, "unity", "done")
                    self._phase(build, "package", "done")
                    self._finish(build, "dry_run", reason + " Progress after that line is a dry run. Install the project's editor to build for real.")
                    return
                self._phase(build, "unity", "fail")
                self._finish(build, "failed", reason)
                return
            if True:
                self._phase(build, "unity", "done")
                self._phase(build, "package", "run")
                size = file_size(output)
                build["artifactSize"] = size
                if size is None and not Path(output).exists():
                    self._log_line(build, "Unity exited 0 but the output path is not on disk. The execute method may have written elsewhere.")
                self._phase(build, "package", "done")
                self._finish(build, "succeeded", "Build finished.")
            else:
                self._phase(build, "unity", "fail")
                excerpt = self._error_excerpt(build)
                self._finish(build, "failed", excerpt or f"Unity CLI exited {code}.")
        finally:
            if worktree:
                build.setdefault("log", []).append("Removing worktree.")
                self.remove_worktree(project["path"], worktree)

    def _resolve_for_build(self, build):
        sha = build.get("sha")
        hinted = None
        if build.get("projectId"):
            hinted = self.project_by_id(build["projectId"])
            if not hinted:
                raise RuntimeError("That project is no longer in the yard. Rescan.")
        elif build.get("projectName"):
            hinted = self.match_project(build["projectName"])
            if not hinted:
                raise RuntimeError(f"No project named {build['projectName']}. Send PROJECTS.")

        if not sha:
            if not hinted:
                raise RuntimeError("Choose a project.")
            target_sha, subject = self._resolve_staging_or_head(hinted)
            if target_sha:
                sha = target_sha
                build["sha"] = target_sha
                build["shortSha"] = target_sha[:7]
                build["commitSubject"] = subject
            else:
                git = hinted.get("git") or {}
                return hinted, git.get("sha"), git.get("subject")

        pool = [hinted] if hinted else list(self.projects)
        matches = []
        for project in pool:
            if not project.get("git"):
                continue
            ok, full = self.has_commit(project["path"], sha)
            if ok:
                subject = self._subject(project["path"], full)
                matches.append((project, full, subject))
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            raise AmbiguousProject([m[0] for m in matches])

        self._log_line(build, f"Commit {sha} is not local. Fetching remotes.")
        fetched = []
        for project in pool:
            if not project.get("git"):
                continue
            self._log_line(build, f"git fetch in {project['name']}")
            full = self.ensure_commit(project, sha)
            if full:
                fetched.append((project, full, self._subject(project["path"], full)))
        if len(fetched) == 1:
            return fetched[0]
        if len(fetched) > 1:
            raise AmbiguousProject([m[0] for m in fetched])

        if not self.settings.get("github_token"):
            raise RuntimeError(self._missing_commit_message(sha, hinted))

        self._log_line(build, "Searching the connected GitHub account for that commit.")
        hits = self.github_find_commit(sha)
        if not hits:
            raise RuntimeError(self._missing_commit_message(sha, hinted))
        if hinted:
            linked = self.linked_repo(hinted)
            hits = [h for h in hits if linked and (h["owner"], h["repo"]) == linked] or hits
        if len(hits) > 1 and not hinted:
            names = ", ".join(f"{h['owner']}/{h['repo']}" for h in hits)
            raise RuntimeError(f"Commit {sha} exists in more than one repo ({names}). Name the project.")
        hit = hits[0]
        local = self.project_for_repo(hit["owner"], hit["repo"])
        if local and (not hinted or local["id"] == hinted["id"]):
            full = self.ensure_commit(local, sha, remote_repo=hit)
            if not full:
                raise RuntimeError(f"Found {sha} in {hit['owner']}/{hit['repo']} but could not fetch it.")
            return local, full, hit.get("subject") or self._subject(local["path"], full)

        if hinted and self.linked_repo(hinted) == (hit["owner"], hit["repo"]):
            full = self.ensure_commit(hinted, sha, remote_repo=hit)
            if full:
                return hinted, full, hit.get("subject") or ""

        self._log_line(build, f"Cloning {hit['owner']}/{hit['repo']} to reach {sha}.")
        cloned, full = self.clone_for_commit(hit, sha)
        return cloned, full, hit.get("subject") or ""

    def _missing_commit_message(self, sha, project):
        if not self.settings.get("github_token"):
            where = f" in {project['name']}" if project else ""
            return (
                f"Commit {sha} was not found{where}. "
                "Connect GitHub in FORGE so I can search your account and fetch it."
            )
        return f"Commit {sha} was not in the local projects or the connected GitHub account."

    def match_project(self, name: str):
        needle = name.strip().lower()
        exact = [
            p for p in self.projects
            if p["name"].lower() == needle or Path(p["path"]).name.lower() == needle
        ]
        if len(exact) == 1:
            return exact[0]
        if len(exact) > 1:
            raise AmbiguousProject(exact)
        partial = [
            p for p in self.projects
            if needle in p["name"].lower() or needle in Path(p["path"]).name.lower()
        ]
        if len(partial) == 1:
            return partial[0]
        if len(partial) > 1:
            raise AmbiguousProject(partial)
        return None

    def project_for_repo(self, owner: str, repo: str):
        want = (owner.lower(), repo.lower())
        for project in self.projects:
            linked = self.linked_repo(project)
            if linked and (linked[0].lower(), linked[1].lower()) == want:
                return project
            git = project.get("git") or {}
            gh = git.get("github")
            if gh and gh["owner"].lower() == want[0] and gh["repo"].lower() == want[1]:
                return project
        return None

    def linked_repo(self, project):
        link = (self.settings.get("links") or {}).get(project["id"])
        if link and "/" in link:
            owner, repo = link.split("/", 1)
            return owner, repo
        git = project.get("git") or {}
        gh = git.get("github")
        if gh:
            return gh["owner"], gh["repo"]
        return None

    def link_repo(self, project_id: str, owner: str, repo: str):
        project = self.project_by_id(project_id)
        if not project:
            raise KeyError("Unknown project")
        links = dict(self.settings.get("links") or {})
        links[project_id] = f"{owner}/{repo}"
        self.settings["links"] = links
        self.save_settings()
        return links[project_id]

    def has_commit(self, repo, sha):
        result = self.git(repo, ["rev-parse", "--verify", f"{sha}^{{commit}}"], timeout=15)
        if result.returncode == 0:
            return True, result.stdout.strip()
        return False, None

    def _subject(self, repo, sha):
        result = self.git(repo, ["log", "-1", "--format=%s", sha], timeout=10)
        return result.stdout.strip()

    def ensure_commit(self, project, sha, remote_repo=None):
        ok, full = self.has_commit(project["path"], sha)
        if ok:
            return full
        self.git(project["path"], ["fetch", "--all", "--tags", "--prune"], timeout=180)
        self.git(project["path"], ["fetch", "origin", sha], timeout=120)
        ok, full = self.has_commit(project["path"], sha)
        if ok:
            return full
        remote = remote_repo or {}
        linked = self.linked_repo(project)
        owner = remote.get("owner") or (linked[0] if linked else None)
        repo = remote.get("repo") or (linked[1] if linked else None)
        if owner and repo and self.settings.get("github_token"):
            url = f"https://github.com/{owner}/{repo}.git"
            self.ensure_remote(project["path"], "github", url)
            self.git(project["path"], ["fetch", "github", sha], timeout=180)
            ok, full = self.has_commit(project["path"], sha)
            if ok:
                return full
        return None

    def ensure_remote(self, repo, name, url):
        current = self.git(repo, ["remote", "get-url", name], timeout=10)
        if current.returncode == 0:
            if current.stdout.strip() != url:
                self.git(repo, ["remote", "set-url", name, url], timeout=10)
            return
        self.git(repo, ["remote", "add", name, url], timeout=10)

    def add_worktree(self, repo, sha, dest: Path):
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        dest.parent.mkdir(parents=True, exist_ok=True)
        result = self.git(repo, ["worktree", "add", "--detach", str(dest), sha], timeout=120)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or "git worktree add failed").strip())

        # Guarantee framework assets in worktree (copying untracked/local framework files if any)
        src_framework = Path(repo) / "Assets" / "Plugins" / "SKCFramework"
        dest_framework = dest / "Assets" / "Plugins" / "SKCFramework"
        if src_framework.is_dir():
            try:
                dest_framework.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(src_framework, dest_framework, dirs_exist_ok=True)
            except OSError:
                pass

        # Ensure compiler .rsp defines exist in worktree Assets/csc.rsp for batchmode CLI builds
        src_rsp = Path(repo) / "Assets" / "Plugins" / "SKCFramework" / "_Scripts" / "SKC.Framework.rsp"
        if not src_rsp.is_file():
            src_rsp = Path(repo) / "Assets" / "csc.rsp"
        if src_rsp.is_file():
            try:
                (dest / "Assets").mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src_rsp, dest / "Assets" / "csc.rsp")
            except OSError:
                pass

    def remove_worktree(self, repo, dest):
        self.git(repo, ["worktree", "remove", "--force", str(dest)], timeout=60)
        if Path(dest).exists():
            shutil.rmtree(dest, ignore_errors=True)
        self.git(repo, ["worktree", "prune"], timeout=20)

    def clone_for_commit(self, hit, sha):
        dest = self.data / "clones" / safe_seg(hit["owner"]) / safe_seg(hit["repo"])
        url = f"https://github.com/{hit['owner']}/{hit['repo']}.git"
        if not (dest / ".git").exists():
            if dest.exists():
                shutil.rmtree(dest, ignore_errors=True)
            dest.parent.mkdir(parents=True, exist_ok=True)
            result = self.git(self.data, ["clone", "--origin", "origin", url, str(dest)], timeout=300)
            if result.returncode != 0:
                raise RuntimeError((result.stderr or "git clone failed").strip())
        self.git(dest, ["fetch", "origin", sha], timeout=180)
        ok, full = self.has_commit(dest, sha)
        if not ok:
            raise RuntimeError(f"Cloned {hit['owner']}/{hit['repo']} but commit {sha} is still missing.")
        project_root = find_unity_root(dest)
        if not project_root:
            raise RuntimeError(f"{hit['owner']}/{hit['repo']} does not contain a Unity project.")
        extras = list(self.settings.get("extra_projects") or [])
        if str(project_root) not in extras:
            extras.append(str(project_root))
            self.settings["extra_projects"] = extras
            self.save_settings()
        item = self._enrich({"path": str(project_root), "title": project_root.name, "source": "folder"})
        with self.lock:
            self.projects = [p for p in self.projects if p["id"] != item["id"]] + [item]
            self.projects.sort(key=lambda p: p["name"].lower())
        return item, full

    def github_find_commit(self, sha: str):
        query = urllib.parse.quote(f"hash:{sha}")
        status, data = self.gh("GET", f"/search/commits?q={query}&per_page=5", accept="application/vnd.github+json")
        if status == 415 or (status == 200 and not (data or {}).get("items")):
            status, data = self.gh(
                "GET",
                f"/search/commits?q={query}&per_page=5",
                accept="application/vnd.github.cloak-preview+json",
            )
        if status != 200 or not isinstance(data, dict):
            return []
        hits = []
        for item in data.get("items") or []:
            parsed = repo_from_commit_item(item)
            if not parsed:
                continue
            owner, repo = parsed
            message = ((item.get("commit") or {}).get("message") or "").splitlines()
            hits.append({
                "owner": owner,
                "repo": repo,
                "sha": item.get("sha") or sha,
                "subject": message[0] if message else "",
            })
        return hits

    def inject_build_script(self, project_path: str) -> str:
        destination = Path(project_path) / "Assets" / "Editor"
        destination.mkdir(parents=True, exist_ok=True)
        target = destination / "ForgeBuild.cs"
        if EDITOR_SCRIPT.is_file():
            shutil.copyfile(EDITOR_SCRIPT, target)
        meta = destination / "ForgeBuild.cs.meta"
        if not meta.exists():
            guid = hashlib.sha1(str(target).encode()).hexdigest()[:32]
            meta.write_text(
                "fileFormatVersion: 2\n"
                f"guid: {guid}\n"
                "MonoImporter:\n"
                "  externalObjects: {}\n"
                "  serializedVersion: 2\n"
                "  defaultReferences: []\n"
                "  executionOrder: 0\n"
                "  icon: {instanceID: 0}\n"
                "  userData: \n"
                "  assetBundleName: \n"
                "  assetBundleVariant: \n",
                encoding="utf-8",
            )
        return "Forge.CLI.PerformBuild"

    def _get_project_version(self, project):
        path = project.get("path")
        if path and Path(path).is_dir():
            ps_asset = Path(path) / "ProjectSettings" / "ProjectSettings.asset"
            if ps_asset.is_file():
                try:
                    text = ps_asset.read_text(encoding="utf-8", errors="ignore")
                    m = re.search(r"bundleVersion:\s*([^\r\n]+)", text)
                    if m:
                        v = m.group(1).strip().strip("'\"")
                        if v:
                            return v
                except Exception:
                    pass
        return project.get("version") or "1.0.0"

    def artifact_path(self, project, build):
        build_dir = Path(project["path"]) / "Build"
        build_dir.mkdir(parents=True, exist_ok=True)
        ext = {
            "Android": ".apk",
            "StandaloneWindows64": ".exe",
            "StandaloneOSX": ".app",
            "StandaloneLinux64": ".x86_64",
        }.get(build["target"], ".apk")
        
        proj_name = safe_seg(project.get("name") or "UnityGame")
        version = self._get_project_version(project)
        name = f"{proj_name}_v{version}{ext}"
        return str(build_dir / name)

    def output_dir(self):
        raw = self.settings.get("output_dir") or str(self.data / "artifacts")
        path = Path(raw).expanduser()
        path.mkdir(parents=True, exist_ok=True)
        return str(path)

    def hypothetical_cli(self, project_path, build, output, log_file):
        cmd = [
            self.locate_unity() or "unity",
            "build",
            project_path,
            "--target", build["target"],
            "--execute-method", "AndroidCLIBuilder.BuildAPKWithProfile",
            "--output-path", output,
            "--log-file", str(log_file),
            "--format", "ndjson",
            "--non-interactive",
            "--no-banner",
            "--no-color",
            "--allow-dirty-build",
        ]
        if build["target"] == "Android":
            cmd.extend(["--android-export-type", self.settings.get("android_export") or "apk"])
        return cmd

    def build_argv(self, project_path, project, build, output, log_file):
        unity = self.locate_unity()
        if unity:
            return self.hypothetical_cli(project_path, build, output, log_file), "cli"
        editor = self.match_editor(project.get("version"))
        if editor:
            export = self.settings.get("android_export") or "apk"
            return [
                editor,
                "-batchmode", "-nographics", "-quit",
                "-projectPath", project_path,
                "-buildTarget", build["target"],
                "-executeMethod", "AndroidCLIBuilder.BuildAPKWithProfile",
                "-buildOutput", output,
                "-forgeOutput", output,
                "-forgeTarget", build["target"],
                "-forgeAndroidExport", export,
                "-logFile", str(log_file),
            ], "editor"
        return None, "dry-run"

    def _stream_build(self, build, argv, log_file: Path):
        log_file.parent.mkdir(parents=True, exist_ok=True)
        stop = threading.Event()
        tail = threading.Thread(target=self._tail_file, args=(log_file, build, stop), daemon=True)
        tail.start()
        proc = subprocess.Popen(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,
            env=self._unity_env(),
        )
        build["pid"] = proc.pid
        code = 1
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                self._consume_line(build, line.rstrip("\n"))
                if build.get("cancel"):
                    try:
                        os.killpg(proc.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    break
            code = proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            code = proc.wait()
        finally:
            stop.set()
            build["pid"] = None
            tail.join(timeout=2)
        return code

    def _tail_file(self, path: Path, build, stop: threading.Event):
        pos = 0
        seen = 0
        while not stop.is_set():
            if path.exists():
                try:
                    with path.open("r", encoding="utf-8", errors="replace") as handle:
                        handle.seek(pos)
                        chunk = handle.read()
                        pos = handle.tell()
                except OSError:
                    chunk = ""
                if chunk:
                    for line in chunk.splitlines():
                        seen += 1
                        if seen > 4000:
                            break
                        self._consume_line(build, line)
            stop.wait(0.35)

    def _simulate(self, build, log_file: Path):
        output = build.get("outputPath") or "Builds/player.apk"
        lines = [
            json.dumps({"type": "progress", "command": "build", "message": "Resolving project..."}),
            json.dumps({"type": "progress", "command": "build", "message": "Resolving editor..."}),
            json.dumps({"type": "progress", "command": "build", "message": "Starting Unity..."}),
            "Licensing: successfully resolved entitlement (dry run)",
            "Batchmode: starting player build",
            "Importing assets... 18%",
            "Importing assets... 34%",
            "Compiling scripts...",
            "[1/6] Assets/Scripts/PlayerMotor.cs",
            "[4/6] Assets/Scripts/AosInput.cs",
            "[6/6] Assets/Editor/ForgeBuild.cs",
            "FORGE: PerformBuild start",
            "FORGE: progress 30 Switching target " + build.get("target", "Android"),
            "FORGE: progress 55 Building player",
            "Building scene Assets/Scenes/Main.unity",
            "IL2CPP: converting managed assemblies",
            "Gradle: assembling player",
            "Packaging APK " + output,
            json.dumps({"type": "progress", "command": "build", "message": "Unity exited (code 0)"}),
            "Build Finished, Result: Success.",
            "FORGE dry run: Unity CLI was not executed. No player artifact was written.",
        ]
        step = float(os.environ.get("FORGE_SIM_STEP") or 0.62)
        log_file.parent.mkdir(parents=True, exist_ok=True)
        with log_file.open("w", encoding="utf-8") as handle:
            for line in lines:
                if build.get("cancel"):
                    handle.write("Cancelled.\n")
                    return
                handle.write(line + "\n")
                handle.flush()
                self._consume_line(build, line)
                time.sleep(step)

    def _consume_line(self, build, line: str):
        if line is None:
            return
        line = line.rstrip()
        if not line:
            return
        # Avoid duplicate flood from stdout + log tail.
        log = build.setdefault("log", [])
        if log and log[-1] == line:
            return
        log.append(line)
        if len(log) > 500:
            del log[:200]
        parsed = interpret_line(line)
        percent = build.get("percent") or 0
        if parsed["percent"] is not None:
            mapped = 24 + parsed["percent"] * 0.74
            percent = max(percent, min(98, mapped))
            build["percent"] = round(percent, 1)
        if parsed.get("stage") and (parsed["percent"] is None or parsed["percent"] >= (build.get("_stagePct") or 0)):
            build["stage"] = parsed["stage"]
            if parsed["percent"] is not None:
                build["_stagePct"] = parsed["percent"]
        build["message"] = parsed.get("message") or line[:220]
        self._touch(build, telegram=True)

    def _touch(self, build, telegram=False):
        build["updatedAt"] = now_iso()
        if telegram and build.get("chatId") and build.get("telegramMessageId"):
            now = time.time()
            if now - build.get("_tg_edit", 0) > 2.0:
                build["_tg_edit"] = now
                try:
                    self.tg_edit(build["chatId"], build["telegramMessageId"], self.progress_text(build))
                except Exception as exc:
                    self.tg_error = str(exc)

    def progress_text(self, build):
        pct = int(build.get("percent") or 0)
        filled = max(0, min(10, pct // 10))
        bar = "█" * filled + "░" * (10 - filled)
        lines = [
            f"FORGE · {build.get('projectName')} · {build.get('targetAlias')} · {pct}%",
            bar,
            build.get("stage") or "",
            (build.get("message") or "")[:200],
        ]
        return "\n".join(lines)

    def _finish(self, build, status, message):
        build["status"] = status
        build["finishedAt"] = now_iso()
        build["error"] = None if status in ("succeeded", "dry_run") else message
        build["message"] = message
        if status in ("succeeded", "dry_run"):
            build["percent"] = 100
            build["stage"] = "Dry run finished" if status == "dry_run" else "Built"
        elif status == "cancelled":
            build["stage"] = "Cancelled"
        else:
            build["stage"] = "Failed"
        self._log_line(build, message)
        self.save_builds()

        # Perform cloud upload before sending final completion notification to Telegram
        if status == "succeeded" and build.get("outputPath"):
            apk_path = Path(build["outputPath"])
            if apk_path.is_file():
                file_mb = apk_path.stat().st_size / (1024 * 1024)
                if build.get("chatId"):
                    try:
                        self.tg_send(build["chatId"], f"⚡️ Build tamamlandı ({apk_path.name}, {file_mb:.1f} MB).\nBulut & yedek indirme bağlantıları oluşturuluyor...")
                    except Exception:
                        pass
                cloud_res = self.upload_to_cloud(apk_path)
                if isinstance(cloud_res, dict):
                    if cloud_res.get("primary"):
                        build["downloadUrl"] = cloud_res["primary"]
                    if cloud_res.get("backup") and cloud_res.get("backup") != cloud_res.get("primary"):
                        build["backupUrl"] = cloud_res["backup"]
                    self.save_builds()

        if build.get("chatId") and build.get("telegramMessageId"):
            try:
                self.tg_edit(build["chatId"], build["telegramMessageId"], self.done_text(build))
            except Exception:
                try:
                    self.tg_send(build["chatId"], self.done_text(build))
                except Exception as exc:
                    self.tg_error = str(exc)
        elif build.get("chatId"):
            try:
                self.tg_send(build["chatId"], self.done_text(build))
            except Exception as exc:
                self.tg_error = str(exc)

    def done_text(self, build):
        status = build.get("status")
        label = {
            "succeeded": "built",
            "dry_run": "dry run",
            "failed": "failed",
            "cancelled": "cancelled",
        }.get(status, status)
        lines = [
            f"FORGE · {label}",
            f"{build.get('projectName')} · {build.get('targetAlias')} · {build.get('shortSha') or 'HEAD'}",
            build.get("message") or "",
        ]
        if build.get("outputPath") and status == "succeeded":
            lines.append(f"\n📦 Dosya: {Path(build['outputPath']).name}")
        if build.get("downloadUrl"):
            lines.append(f"\n☁️ Ana İndirme Linki (GoFile):\n{build['downloadUrl']}")
        if build.get("backupUrl"):
            lines.append(f"\n🔗 Yedek İndirme Linki (Direct APK):\n{build['backupUrl']}")
        elif build.get("outputPath") and status == "succeeded" and not build.get("downloadUrl"):
            lines.append("Output: " + build["outputPath"])
        if build.get("command"):
            lines.append(build["command"][:500])
        return "\n".join(lines)[:3900]

    def _phase(self, build, phase_id, state):
        for phase in build.get("phases") or []:
            if phase["id"] == phase_id:
                phase["state"] = state
                return

    def _log_line(self, build, line):
        self._consume_line(build, line)

    def _error_excerpt(self, build):
        interesting = []
        for line in reversed(build.get("log") or []):
            if re.search(r"error|exception|failed|failure", line, re.I):
                interesting.append(line)
            if len(interesting) >= 4:
                break
        if interesting:
            return "\n".join(reversed(interesting))[:800]
        tail = (build.get("log") or [])[-4:]
        return "\n".join(tail)[:800]

    def build_by_id(self, build_id):
        for build in self.builds:
            if build["id"] == build_id:
                return build
        return None

    def project_by_id(self, project_id):
        for project in self.projects:
            if project["id"] == project_id:
                return project
        return None

    # ---------- git / github / telegram ----------

    def git(self, cwd, args, timeout=60):
        try:
            return subprocess.run(
                ["git", *args],
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=timeout,
                env=self.git_env(),
            )
        except subprocess.TimeoutExpired:
            return subprocess.CompletedProcess(args, 124, "", "git timed out")
        except OSError as exc:
            return subprocess.CompletedProcess(args, 127, "", str(exc))

    def git_env(self):
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        token = self.settings.get("github_token") or ""
        if token:
            script = self.data / "askpass.sh"
            script.write_text(
                "#!/bin/sh\n"
                "case \"$1\" in\n"
                "*Username*) printf '%s\\n' x-access-token ;;\n"
                "*) printf '%s\\n' \"$FORGE_GIT_TOKEN\" ;;\n"
                "esac\n",
                encoding="utf-8",
            )
            os.chmod(script, 0o700)
            env["GIT_ASKPASS"] = str(script)
            env["GIT_ASKPASS_REQUIRE"] = "force"
            env["FORGE_GIT_TOKEN"] = token
        return env

    def gh(self, method, path, body=None, accept="application/vnd.github+json"):
        token = self.settings.get("github_token") or ""
        if not token:
            return 401, {"message": "GitHub is not connected"}
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            "https://api.github.com" + path,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": accept,
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "FORGE-Unity-Build",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read().decode()
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode(errors="replace")
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {"message": raw[:300]}
            return exc.code, payload
        except urllib.error.URLError as exc:
            return 0, {"message": str(exc.reason)}

    def connect_github(self, token: str):
        token = (token or "").strip()
        if not token:
            raise RuntimeError("Paste a GitHub personal access token.")
        self.settings["github_token"] = token
        self.save_settings()
        status, data = self.gh("GET", "/user")
        if status != 200:
            self.settings["github_token"] = ""
            self.github_profile = {}
            self.save_settings()
            message = data.get("message") if isinstance(data, dict) else "GitHub rejected the token"
            raise RuntimeError(message or f"GitHub returned {status}")
        self.github_profile = public_github_user(data)
        self._save_json(self.data / "github-profile.json", self.github_profile, mode=0o644)
        return self.github_profile

    def disconnect_github(self):
        self.settings["github_token"] = ""
        self.github_profile = {}
        self.save_settings()
        profile = self.data / "github-profile.json"
        if profile.exists():
            profile.unlink()

    def refresh_github(self):
        status, data = self.gh("GET", "/user")
        if status == 200 and isinstance(data, dict):
            self.github_profile = public_github_user(data)
            self._save_json(self.data / "github-profile.json", self.github_profile, mode=0o644)
        elif status in (401, 403):
            self.github_profile = {}

    def github_repos(self):
        status, data = self.gh("GET", "/user/repos?per_page=40&sort=updated&affiliation=owner,collaborator,organization_member")
        if status != 200 or not isinstance(data, list):
            message = data.get("message") if isinstance(data, dict) else "Could not list repositories"
            raise RuntimeError(message or f"GitHub returned {status}")
        repos = []
        for repo in data:
            owner = (repo.get("owner") or {}).get("login")
            repos.append({
                "name": repo.get("name"),
                "fullName": repo.get("full_name"),
                "owner": owner,
                "private": bool(repo.get("private")),
                "description": repo.get("description") or "",
                "updatedAt": repo.get("updated_at"),
                "defaultBranch": repo.get("default_branch"),
                "language": repo.get("language") or "",
            })
        return repos

    def github_commits(self, owner: str, repo: str):
        path = f"/repos/{urllib.parse.quote(owner)}/{urllib.parse.quote(repo)}/commits?per_page=15"
        status, data = self.gh("GET", path)
        if status != 200 or not isinstance(data, list):
            message = data.get("message") if isinstance(data, dict) else "Could not list commits"
            raise RuntimeError(message or f"GitHub returned {status}")
        commits = []
        for item in data:
            commit = item.get("commit") or {}
            message = (commit.get("message") or "").splitlines()
            author = (commit.get("author") or {}).get("name") or ""
            commits.append({
                "sha": item.get("sha"),
                "short": (item.get("sha") or "")[:7],
                "subject": message[0] if message else "",
                "date": (commit.get("author") or {}).get("date") or "",
                "author": author,
            })
        return commits

    def connect_telegram(self, token: str):
        token = (token or "").strip()
        if not token or ":" not in token:
            raise RuntimeError("Paste the bot token from BotFather. It looks like 123456:ABC...")
        self.settings["telegram_token"] = token
        self.save_settings()
        me = self.tg("getMe", {})
        if not me.get("ok"):
            self.settings["telegram_token"] = ""
            self.save_settings()
            raise RuntimeError(me.get("description") or "Telegram rejected that token")
        self.tg("deleteWebhook", {"drop_pending_updates": False})
        self.tg_error = None
        self.start_telegram()
        result = me.get("result") or {}
        return {"username": result.get("username"), "name": result.get("first_name")}

    def disconnect_telegram(self):
        self.tg_stop = True
        self.settings["telegram_token"] = ""
        self.save_settings()

    def regenerate_pair_code(self):
        self.settings["pair_code"] = f"{secrets.randbelow(900000) + 100000}"
        self.save_settings()
        return self.settings["pair_code"]

    def start_telegram(self):
        if self.tg_thread and self.tg_thread.is_alive():
            return
        self.tg_stop = False
        self.tg_thread = threading.Thread(target=self._tg_loop, name="forge-telegram", daemon=True)
        self.tg_thread.start()

    def _tg_loop(self):
        self.tg_offset = 0
        try:
            self.tg("deleteWebhook", {})
            self.tg("setMyCommands", {
                "commands": [
                    {"command": "status", "description": "Check FORGE status (Idle / Building)"},
                    {"command": "build", "description": "Start Android build from staging branch"},
                    {"command": "projects", "description": "List scanned Unity & GitHub projects"},
                    {"command": "builds", "description": "List recent build history"},
                    {"command": "cancel", "description": "Cancel currently running build"},
                    {"command": "help", "description": "Show command help menu"},
                ]
            })
        except Exception as exc:
            self.tg_error = str(exc)
        while not self.tg_stop and self.settings.get("telegram_token"):
            try:
                data = self.tg("getUpdates", {"timeout": 8, "offset": self.tg_offset, "allowed_updates": ["message"]})
            except Exception as exc:
                self.tg_error = str(exc)
                time.sleep(3)
                continue
            if not data.get("ok"):
                self.tg_error = data.get("description") or "getUpdates failed"
                if data.get("error_code") == 401:
                    self.tg_stop = True
                    break
                time.sleep(3)
                continue
            self.tg_error = None
            for update in data.get("result") or []:
                self.tg_offset = update["update_id"] + 1
                message = update.get("message") or {}
                text = message.get("text")
                chat = message.get("chat") or {}
                if not text or "id" not in chat:
                    continue
                result = self.handle_command(text, source="telegram", chat_id=chat.get("id"))
                if result.get("buildId"):
                    continue
                try:
                    self.tg_send(chat["id"], result.get("reply") or "OK")
                except Exception as exc:
                    self.tg_error = str(exc)
        self.tg_thread = None

    def tg(self, method, payload):
        token = self.settings.get("telegram_token") or ""
        if not token:
            raise RuntimeError("Telegram is not connected")
        url = f"https://api.telegram.org/bot{token}/{method}"
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=40) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode(errors="replace")
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"ok": False, "description": raw[:300], "error_code": exc.code}
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Telegram network error: {exc.reason}") from exc

    def tg_send(self, chat_id, text):
        data = self.tg("sendMessage", {"chat_id": chat_id, "text": text[:4000]})
        if not data.get("ok"):
            raise RuntimeError(data.get("description") or "sendMessage failed")
        return (data.get("result") or {}).get("message_id")

    def tg_edit(self, chat_id, message_id, text):
        data = self.tg("editMessageText", {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text[:4000],
        })
        if not data.get("ok") and "message is not modified" not in str(data.get("description", "")).lower():
            raise RuntimeError(data.get("description") or "editMessageText failed")
        return data

    def tg_send_document(self, chat_id, file_path, caption=""):
        token = self.settings.get("telegram_token") or ""
        if not token:
            raise RuntimeError("Telegram is not connected")
        path = Path(file_path)
        if not path.is_file():
            raise RuntimeError(f"File not found: {file_path}")

        file_size_mb = path.stat().st_size / (1024 * 1024)
        if file_size_mb > 49.5:
            self.tg_send(chat_id, f"⚠️ APK dosyası ({file_size_mb:.1f} MB) Telegram 50MB yükleme limitini aşıyor.\nDosya konumu: {path}")
            return None

        try:
            self.tg_send(chat_id, f"📦 APK dosyası Telegram'a gönderiliyor ({file_size_mb:.1f} MB)...")
        except Exception:
            pass

        boundary = f"----WebKitFormBoundary{secrets.token_hex(16)}"
        body = bytearray()

        def add_field(name, val):
            body.extend(f"--{boundary}\r\n".encode("utf-8"))
            body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
            body.extend(f"{val}\r\n".encode("utf-8"))

        add_field("chat_id", str(chat_id))
        if caption:
            add_field("caption", str(caption)[:1000])

        filename = path.name
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="document"; filename="{filename}"\r\n'.encode("utf-8"))
        body.extend(b"Content-Type: application/vnd.android.package-archive\r\n\r\n")
        with open(path, "rb") as f:
            body.extend(f.read())
        body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

        url = f"https://api.telegram.org/bot{token}/sendDocument"
        req = urllib.request.Request(
            url,
            data=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=300) as response:
            return json.loads(response.read().decode())

    def upload_to_cloud(self, file_path):
        """Upload build output (APK/AAB) to GoFile & Litterbox concurrently using ThreadPoolExecutor."""
        path = Path(file_path)
        if not path.is_file():
            return {}

        def upload_gofile(p):
            try:
                req = urllib.request.Request("https://api.gofile.io/servers", headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode())
                servers = (data.get("data") or {}).get("servers") or []
                if not servers:
                    return None
                server_name = servers[0]["name"]
                upload_url = f"https://{server_name}.gofile.io/contents/uploadfile"

                boundary = f"----WebKitFormBoundary{secrets.token_hex(16)}"
                body = bytearray()
                body.extend(f"--{boundary}\r\n".encode("utf-8"))
                body.extend(f'Content-Disposition: form-data; name="file"; filename="{p.name}"\r\n'.encode("utf-8"))
                body.extend(b"Content-Type: application/vnd.android.package-archive\r\n\r\n")
                with open(p, "rb") as f:
                    body.extend(f.read())
                body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

                req_upload = urllib.request.Request(
                    upload_url,
                    data=bytes(body),
                    headers={
                        "Content-Type": f"multipart/form-data; boundary={boundary}",
                        "User-Agent": "Mozilla/5.0",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req_upload, timeout=180) as uresp:
                    udata = json.loads(uresp.read().decode())
                    if udata.get("status") == "ok":
                        return (udata.get("data") or {}).get("downloadPage")
            except Exception as exc:
                print(f"[forge] GoFile upload error: {exc}")
            return None

        def upload_litterbox(p):
            try:
                url = "https://litterbox.catbox.moe/resources/internals/api.php"
                boundary = f"----WebKitFormBoundary{secrets.token_hex(16)}"
                body = bytearray()

                def add_field(name, val):
                    body.extend(f"--{boundary}\r\n".encode("utf-8"))
                    body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
                    body.extend(f"{val}\r\n".encode("utf-8"))

                add_field("reqtype", "fileupload")
                add_field("time", "72h")

                body.extend(f"--{boundary}\r\n".encode("utf-8"))
                body.extend(f'Content-Disposition: form-data; name="fileToUpload"; filename="{p.name}"\r\n'.encode("utf-8"))
                body.extend(b"Content-Type: application/vnd.android.package-archive\r\n\r\n")
                with open(p, "rb") as f:
                    body.extend(f.read())
                body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

                req = urllib.request.Request(
                    url,
                    data=bytes(body),
                    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=180) as resp:
                    res_url = resp.read().decode().strip()
                    if res_url.startswith("http"):
                        return res_url
            except Exception as exc:
                print(f"[forge] Litterbox upload error: {exc}")
            return None

        result = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f_gofile = executor.submit(upload_gofile, path)
            f_litterbox = executor.submit(upload_litterbox, path)

            try:
                g_link = f_gofile.result(timeout=180)
                if g_link:
                    result["primary"] = g_link
                    result["gofile"] = g_link
            except Exception:
                pass

            try:
                l_link = f_litterbox.result(timeout=180)
                if l_link:
                    result["litterbox"] = l_link
                    if "primary" not in result:
                        result["primary"] = l_link
                    result["backup"] = l_link
            except Exception:
                pass

        return result

    def install_unity_cli(self):
        if self.install.get("running"):
            return False
        self.install = {"running": True, "log": ["Starting Unity CLI install…"], "error": None, "finishedAt": None}
        threading.Thread(target=self._install_worker, name="forge-install", daemon=True).start()
        return True

    def _install_worker(self):
        cmd = "curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta bash"
        try:
            proc = subprocess.Popen(
                ["bash", "-lc", cmd],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            assert proc.stdout is not None
            for line in proc.stdout:
                self.install["log"].append(line.rstrip())
                self.install["log"] = self.install["log"][-100:]
            code = proc.wait()
            self.install["error"] = None if code == 0 else f"Installer exited {code}"
            self.install["log"].append("Install finished." if code == 0 else f"Install failed ({code}).")
        except Exception as exc:
            self.install["error"] = str(exc)
            self.install["log"].append(str(exc))
        finally:
            self.install["running"] = False
            self.install["finishedAt"] = now_iso()

    def update_settings(self, payload: dict):
        if "unityBin" in payload:
            self.settings["unity_bin"] = str(payload.get("unityBin") or "").strip()
        if "scanRoots" in payload:
            roots = payload.get("scanRoots") or []
            if isinstance(roots, str):
                roots = [line.strip() for line in roots.splitlines() if line.strip()]
            self.settings["scan_roots"] = [str(r) for r in roots][:30]
        if "defaultProjectId" in payload:
            self.settings["default_project_id"] = str(payload.get("defaultProjectId") or "")
        if "simulateIfMissing" in payload:
            self.settings["simulate_if_missing"] = bool(payload.get("simulateIfMissing"))
        if "injectBuildScript" in payload:
            self.settings["inject_build_script"] = bool(payload.get("injectBuildScript"))
        if "outputDir" in payload and payload.get("outputDir"):
            self.settings["output_dir"] = str(payload["outputDir"])
        if "androidExport" in payload and payload.get("androidExport") in ("apk", "aab"):
            self.settings["android_export"] = payload["androidExport"]
        self.save_settings()
        return self.public_settings()

    # ---------- snapshots ----------

    def public_settings(self):
        return {
            "unityBin": self.settings.get("unity_bin") or "",
            "scanRoots": self.settings.get("scan_roots") or [],
            "defaultScanRoots": self.scan_roots(),
            "defaultProjectId": self.settings.get("default_project_id") or "",
            "simulateIfMissing": bool(self.settings.get("simulate_if_missing", True)),
            "injectBuildScript": bool(self.settings.get("inject_build_script", True)),
            "outputDir": self.settings.get("output_dir") or "",
            "androidExport": self.settings.get("android_export") or "apk",
            "pairCode": self.settings.get("pair_code") or "",
            "githubConnected": bool(self.settings.get("github_token")),
            "githubHint": mask(self.settings.get("github_token") or ""),
            "telegramConnected": bool(self.settings.get("telegram_token")),
            "telegramHint": mask(self.settings.get("telegram_token") or ""),
            "telegramChats": self.settings.get("telegram_chats") or [],
            "links": self.settings.get("links") or {},
        }

    def public_build(self, build, with_log=True):
        item = {
            "id": build.get("id"),
            "projectId": build.get("projectId"),
            "projectName": build.get("projectName"),
            "projectPath": build.get("projectPath"),
            "targetAlias": build.get("targetAlias"),
            "target": build.get("target"),
            "sha": build.get("sha"),
            "shortSha": build.get("shortSha"),
            "commitSubject": build.get("commitSubject"),
            "source": build.get("source"),
            "status": build.get("status"),
            "mode": build.get("mode"),
            "simulated": bool(build.get("simulated")),
            "percent": build.get("percent") or 0,
            "stage": build.get("stage"),
            "message": build.get("message"),
            "phases": build.get("phases") or [],
            "command": build.get("command"),
            "logFile": build.get("logFile"),
            "outputPath": build.get("outputPath"),
            "error": build.get("error"),
            "createdAt": build.get("createdAt"),
            "startedAt": build.get("startedAt"),
            "finishedAt": build.get("finishedAt"),
            "artifactSize": build.get("artifactSize"),
        }
        if with_log:
            item["log"] = (build.get("log") or [])[-80:]
        return item

    def snapshot(self):
        with self.lock:
            projects = []
            for project in self.projects:
                item = dict(project)
                item["lastBuild"] = self._last_for(project["id"])
                item["activeBuild"] = self._active_for(project["id"])
                link = (self.settings.get("links") or {}).get(project["id"])
                item["link"] = link
                projects.append(item)
            me = None
            if self.settings.get("telegram_token"):
                me = getattr(self, "_tg_me", None)
            return {
                "ok": True,
                "scan": {k: v for k, v in self.scan.items()},
                "projects": projects,
                "builds": [self.public_build(b) for b in self.builds[:15]],
                "github": {
                    "connected": bool(self.settings.get("github_token")),
                    "profile": self.github_profile or None,
                    "hint": mask(self.settings.get("github_token") or ""),
                },
                "telegram": {
                    "connected": bool(self.settings.get("telegram_token")),
                    "polling": bool(self.tg_thread and self.tg_thread.is_alive()),
                    "error": self.tg_error,
                    "hint": mask(self.settings.get("telegram_token") or ""),
                    "chats": self.settings.get("telegram_chats") or [],
                    "pairCode": self.settings.get("pair_code"),
                    "username": (me or {}).get("username"),
                },
                "commandLog": list(self.command_log[:40]),
                "settings": self.public_settings(),
                "install": {
                    "running": self.install.get("running"),
                    "error": self.install.get("error"),
                    "finishedAt": self.install.get("finishedAt"),
                    "log": (self.install.get("log") or [])[-30:],
                },
                "aliases": ALIASES,
            }

    def _last_for(self, project_id):
        for build in self.builds:
            if build.get("projectId") == project_id and build.get("status") not in ("queued",):
                return {
                    "id": build["id"],
                    "status": build.get("status"),
                    "targetAlias": build.get("targetAlias"),
                    "percent": build.get("percent") or 0,
                    "finishedAt": build.get("finishedAt"),
                    "shortSha": build.get("shortSha"),
                }
        return None

    def _active_for(self, project_id):
        for build in self.builds:
            if build.get("projectId") == project_id and build.get("status") in ("running", "queued"):
                return {
                    "id": build["id"],
                    "status": build.get("status"),
                    "percent": build.get("percent") or 0,
                    "stage": build.get("stage"),
                    "targetAlias": build.get("targetAlias"),
                }
        return None


def read_text_field(path: Path, pattern: str):
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    match = re.search(pattern, text, re.M)
    return match.group(1).strip() if match else ""


def file_size(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return None


def find_unity_root(path: Path):
    if (path / "ProjectSettings" / "ProjectVersion.txt").is_file():
        return path
    try:
        for child in path.iterdir():
            if child.is_dir() and (child / "ProjectSettings" / "ProjectVersion.txt").is_file():
                return child
    except OSError:
        return None
    return None


def parse_github_remote(url: str):
    match = re.search(r"github\.com[:/]([^/]+)/([^/\s]+?)(?:\.git)?$", url.strip())
    if not match:
        return None
    return match.group(1), match.group(2)


def repo_from_commit_item(item):
    repo = item.get("repository") or {}
    full = repo.get("full_name") or ""
    if "/" in full:
        owner, name = full.split("/", 1)
        return owner, name
    url = item.get("html_url") or ""
    match = re.search(r"github\.com/([^/]+)/([^/]+)/commit/", url)
    if match:
        return match.group(1), match.group(2)
    return None


def public_github_user(data):
    return {
        "login": data.get("login"),
        "name": data.get("name") or data.get("login"),
        "avatar": data.get("avatar_url"),
        "htmlUrl": data.get("html_url"),
    }


def extract_json(text: str):
    if not text or not text.strip():
        return None
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass
    objects = []
    for line in stripped.splitlines():
        line = line.strip()
        if not line or line[0] not in "{[":
            continue
        try:
            objects.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    if len(objects) == 1:
        return objects[0]
    if objects and all(isinstance(obj, dict) for obj in objects):
        return objects
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(stripped[start:end + 1])
        except json.JSONDecodeError:
            pass
    start = stripped.find("[")
    end = stripped.rfind("]")
    if start >= 0 and end > start:
        try:
            return json.loads(stripped[start:end + 1])
        except json.JSONDecodeError:
            return None
    return None


def parse_project_payload(stdout: str):
    return extract_json(stdout or "")


def projects_from_payload(payload):
    items = payload_items(payload)
    projects = []
    for item in items:
        if not isinstance(item, dict):
            continue
        path = item.get("path") or item.get("projectPath") or item.get("location")
        if not path:
            continue
        projects.append({
            "path": path,
            "title": item.get("title") or item.get("name") or Path(path).name,
            "version": item.get("version") or item.get("editorVersion") or "",
            "favorite": bool(item.get("isFavorite") or item.get("favorite")),
            "architecture": item.get("architecture") or "",
            "source": "unity-cli",
        })
    return projects


def payload_items(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    data = payload.get("data", payload)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if isinstance(data.get("projects"), list):
            return data["projects"]
        values = list(data.values())
        if values and all(isinstance(v, dict) for v in values) and any(
            isinstance(v, dict) and ("path" in v or "title" in v) for v in values
        ):
            return values
        if "path" in data:
            return [data]
    if isinstance(payload.get("projects"), list):
        return payload["projects"]
    return []


def cli_reported_failure(lines):
    """Unity CLI often exits 0 and reports failure in a JSON result frame."""
    for line in reversed(lines):
        text = line.strip()
        if not text.startswith("{"):
            continue
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict):
            continue
        if obj.get("type") not in (None, "result") and "success" not in obj:
            continue
        if obj.get("success") is False or (isinstance(obj.get("data"), dict) and obj["data"].get("success") is False):
            errors = obj.get("errors") or []
            if errors and isinstance(errors[0], dict):
                return True, errors[0].get("message") or errors[0].get("code") or "Unity CLI reported failure"
            return True, obj.get("message") or "Unity CLI reported failure"
        if obj.get("type") == "result" and obj.get("success") is True:
            return False, None
    return False, None


def interpret_line(line: str):
    message = line
    explicit = None
    if line.startswith("{"):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            obj = None
        if isinstance(obj, dict):
            message = obj.get("message") or message
            if isinstance(obj.get("data"), dict):
                message = obj["data"].get("message") or message
            explicit = obj.get("percent", obj.get("progress"))
            if obj.get("type") == "result":
                explicit = 100 if obj.get("success") else explicit
    match = re.search(r"FORGE:\s*progress\s+(\d{1,3})", message)
    if match:
        explicit = int(match.group(1))
    if explicit is None:
        match = re.search(r"(\d{1,3})%", message)
        if match:
            explicit = int(match.group(1))
    fraction = re.search(r"\[(\d+)/(\d+)\]", message)
    stage = None
    percent = float(explicit) if isinstance(explicit, (int, float)) else None
    if fraction and int(fraction.group(2) or 1):
        ratio = int(fraction.group(1)) / int(fraction.group(2))
        percent = 40 + ratio * 25
        stage = "Compiling scripts"
    for pattern, rule_percent, rule_stage in STAGE_RULES:
        if pattern.search(message):
            stage = rule_stage
            percent = max(percent or 0, rule_percent)
            break
    if percent is not None:
        percent = max(0, min(100, float(percent)))
    return {"percent": percent, "stage": stage, "message": message[:240]}


def self_check():
    samples = {
        "BUILD AOS abcdef1": ("AOS", "abcdef1", None),
        "BUILD AOS commit abcdef1": ("AOS", "abcdef1", None),
        "BUILD AOS commit SHA abcdef1": ("AOS", "abcdef1", None),
        "build aos abcdef1 Northline": ("aos", "abcdef1", "Northline"),
        "/build@ForgeBot AOS abcdef12 Kitefall": ("AOS", "abcdef12", "Kitefall"),
        "BUILD IOS commit deadbee Harbor": ("IOS", "deadbee", "Harbor"),
    }
    for text, expected in samples.items():
        match = BUILD_RE.match(text)
        assert match, text
        got = (match.group("target"), match.group("sha"), match.group("project"))
        assert got[1] == expected[1] and (got[2] or None) == expected[2], (text, got)
    assert BUILD_RE.match("BUILD AOS commit SHA number") is None
    assert BUILD_RE.match("HELP") is None
    payload = {
        "success": True,
        "data": {"projects": [{"path": "/tmp/Game", "title": "Game", "version": "6000.0.0f1"}]},
    }
    projects = projects_from_payload(payload)
    assert projects and projects[0]["title"] == "Game"
    hub = {"data": {"/tmp/Game": {"path": "/tmp/Game", "title": "Game", "version": "2022.3.1f1"}}}
    assert projects_from_payload(hub)[0]["version"] == "2022.3.1f1"
    parsed = interpret_line('{"type":"progress","message":"Starting Unity..."}')
    assert parsed["stage"] == "Starting Unity"
    print("self_check ok")


if __name__ == "__main__":
    self_check()
