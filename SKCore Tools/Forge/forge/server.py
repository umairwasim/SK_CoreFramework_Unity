#!/usr/bin/env python3
"""FORGE local server. Bind all interfaces so the preview host can reach it."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from engine import Forge

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
FORGE = Forge(ROOT)

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")


class Handler(BaseHTTPRequestHandler):
    server_version = "FORGE/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        line = fmt % args
        if "/api/state" in line:
            return
        sys.stderr.write("[forge] " + line + "\n")

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def _route(self, method):
        try:
            parsed = urlparse(self.path)
            path = unquote(parsed.path)
            if path == "/":
                return self._file(STATIC / "index.html")
            if path.startswith("/static/"):
                rel = path[len("/static/"):]
                return self._file(STATIC / rel)
            if path == "/favicon.ico":
                return self._file(STATIC / "favicon.svg")
            if method == "GET":
                return self._get(path)
            return self._post(path)
        except Exception as exc:
            traceback.print_exc()
            self._json(500, {"ok": False, "error": str(exc)})

    def _get(self, path):
        if path == "/api/state":
            return self._json(200, FORGE.snapshot())
        if path == "/api/health":
            return self._json(200, {"ok": True})
        if path == "/api/github/repos":
            try:
                return self._json(200, {"ok": True, "repos": FORGE.github_repos()})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        parts = [p for p in path.split("/") if p]
        if len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "commits":
            try:
                commits = FORGE.commits_for(parts[2])
                return self._json(200, {"ok": True, "commits": commits})
            except KeyError:
                return self._json(404, {"ok": False, "error": "Unknown project"})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        if len(parts) == 6 and parts[:3] == ["api", "github", "repos"] and parts[5] == "commits":
            try:
                commits = FORGE.github_commits(parts[3], parts[4])
                return self._json(200, {"ok": True, "commits": commits})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        if len(parts) == 3 and parts[:2] == ["api", "builds"]:
            build = FORGE.build_by_id(parts[2])
            if not build:
                return self._json(404, {"ok": False, "error": "Unknown build"})
            return self._json(200, {"ok": True, "build": FORGE.public_build(build)})
        return self._json(404, {"ok": False, "error": "Not found"})

    def _post(self, path):
        body = self._body()
        if path == "/api/scan":
            started = FORGE.start_scan()
            return self._json(200, {"ok": True, "started": started})
        if path == "/api/command":
            result = FORGE.handle_command(body.get("text") or "", source=body.get("source") or "ui")
            return self._json(200, result)
        if path == "/api/builds":
            try:
                build = FORGE.enqueue_build(
                    project_id=body.get("projectId"),
                    project_name=body.get("projectName"),
                    target_alias=body.get("target") or "AOS",
                    sha=body.get("sha") or None,
                    source=body.get("source") or "ui",
                )
                return self._json(200, {"ok": True, "build": FORGE.public_build(build), "reply": FORGE._start_reply(build)})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        if path == "/api/projects/add":
            try:
                added = FORGE.add_project_path(body.get("path") or "")
                FORGE.start_scan()
                return self._json(200, {"ok": True, "path": added})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        if path == "/api/github/connect":
            try:
                profile = FORGE.connect_github(body.get("token") or "")
                return self._json(200, {"ok": True, "profile": profile})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        if path == "/api/github/disconnect":
            FORGE.disconnect_github()
            return self._json(200, {"ok": True})
        if path == "/api/github/link":
            try:
                link = FORGE.link_repo(body.get("projectId") or "", body.get("owner") or "", body.get("repo") or "")
                return self._json(200, {"ok": True, "link": link})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        if path == "/api/telegram/connect":
            try:
                me = FORGE.connect_telegram(body.get("token") or "")
                return self._json(200, {"ok": True, "bot": me})
            except Exception as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
        if path == "/api/telegram/disconnect":
            FORGE.disconnect_telegram()
            return self._json(200, {"ok": True})
        if path == "/api/telegram/pair":
            code = FORGE.regenerate_pair_code()
            return self._json(200, {"ok": True, "pairCode": code})
        if path == "/api/settings":
            return self._json(200, {"ok": True, "settings": FORGE.update_settings(body)})
        if path == "/api/unity/install":
            started = FORGE.install_unity_cli()
            return self._json(200, {"ok": True, "started": started})
        parts = [p for p in path.split("/") if p]
        if len(parts) == 4 and parts[:2] == ["api", "builds"] and parts[3] == "cancel":
            try:
                FORGE.cancel_build(parts[2])
                return self._json(200, {"ok": True})
            except KeyError:
                return self._json(404, {"ok": False, "error": "Unknown build"})
        return self._json(404, {"ok": False, "error": "Not found"})

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 1_000_000:
            raise RuntimeError("Request body is too large")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _json(self, code, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _file(self, path: Path):
        try:
            path = path.resolve()
            path.relative_to(STATIC.resolve())
        except ValueError:
            return self._json(403, {"ok": False, "error": "Forbidden"})
        if not path.is_file():
            return self._json(404, {"ok": False, "error": "Not found"})
        data = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


def main():
    host = "0.0.0.0"
    port = int(os.environ.get("FORGE_PORT", 8787))
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    print(f"FORGE listening on http://{host}:{port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("FORGE stopped", flush=True)


if __name__ == "__main__":
    main()
