#!/usr/bin/env python3
"""Publish a self-contained visual index of a committed ASTRAVA revision."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs/architecture"
VERSION = "0.9.115"
VIS_URL = "https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"
VIS_SHA384 = "Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1"
CODE = {".js", ".mjs", ".cjs", ".py", ".ts", ".tsx", ".rs"}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def inline_javascript(html):
    """Remove asset payloads and preserve source line numbers for GitHub links."""
    lines = [""] * (html.count("\n") + 1)
    for script in re.finditer(r"<script\b([^>]*)>(.*?)</script\s*>", html, re.I | re.S):
        attrs = script[1]
        if re.search(r"""\bsrc\s*=|\bid=['"]asStudioCode['"]|\btype=['"]application/json['"]""", attrs):
            continue
        start = html.count("\n", 0, script.start(2))
        code = re.sub(r"(data:image/[\w.+-]+;base64,)[A-Za-z0-9+/=]+", r"\1OMITTED", script[2])
        for index, line in enumerate(code.split("\n"), start):
            lines[index] += line
    return "\n".join(lines)


def stage_source(directory, revision):
    files = git("ls-tree", "-r", "--name-only", "-z", revision).decode().split("\0")
    count = 0
    for name in files:
        path = Path(name)
        if path.suffix not in CODE or "vendor" in path.parts:
            continue
        target = directory / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(git("show", f"{revision}:{name}"))
        count += 1
    target = directory / "src/app.inline.js"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(inline_javascript(git("show", f"{revision}:src/app.html").decode()), encoding="utf-8")
    return count + 1


def load_visualization():
    with urlopen(VIS_URL, timeout=30) as response:
        library = response.read()
    checksum = base64.b64encode(hashlib.sha384(library).digest()).decode()
    if checksum != VIS_SHA384:
        raise RuntimeError("vis-network checksum mismatch")
    script = library.decode()
    if "</script" in script.lower():
        raise RuntimeError("vis-network cannot be embedded as a script")
    return script


def publish(graph_directory, revision, count):
    graph_path = graph_directory / "graph.json"
    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    nodes = [
        [node["id"], node["label"], node.get("source_file") or "",
         node.get("source_location") or "", node.get("community")]
        for node in sorted(graph["nodes"], key=lambda node: node["id"])
    ]
    edges = [
        [link["source"], link["target"], link["relation"], link.get("confidence")]
        for link in graph["links"]
    ]
    if not nodes or not edges:
        raise RuntimeError("Graphify returned an empty graph")
    payload = {"revision": revision, "files": count, "nodes": nodes, "edges": edges}
    embedded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    template = (ROOT / "tools/architecture-view.html").read_text(encoding="utf-8")
    html = template.replace("/* VIS_NETWORK */", load_visualization(), 1)
    html = html.replace("/* GRAPH_PAYLOAD */", embedded, 1)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "index.html").write_text(html, encoding="utf-8")
    shutil.copyfile(graph_path, OUTPUT / "graph.json")
    shutil.copyfile(graph_directory / "GRAPH_REPORT.md", OUTPUT / "GRAPH_REPORT.md")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--graphify", default="graphify", help="path to the Graphify 0.9.115 executable")
    parser.add_argument("--revision", default="HEAD", help="Git revision to analyze")
    options = parser.parse_args()
    revision = git("rev-parse", "--verify", "--end-of-options", options.revision + "^{commit}").decode().strip()
    env = {**os.environ, "GRAPHIFY_BACKEND": "none", "GRAPHIFY_QUERY_LOG_DISABLE": "1"}
    version = subprocess.check_output([options.graphify, "--version"], cwd=ROOT, env=env, text=True)
    if version.strip() != f"graphify {VERSION}":
        raise RuntimeError(f"Expected graphify {VERSION}, got {version.strip()}")
    with tempfile.TemporaryDirectory(prefix="astrava-architecture-") as temporary:
        project = Path(temporary) / "ASTRAVA"
        count = stage_source(project, revision)
        for command in (["extract", str(project), "--code-only", "--max-workers", "2"],
                        ["cluster-only", str(project), "--no-label"]):
            subprocess.run([options.graphify, *command], cwd=project, env=env, check=True)
        publish(project / "graphify-out", revision, count)
    print(f"{OUTPUT.relative_to(ROOT)}/index.html (source {revision[:7]})")


if __name__ == "__main__":
    main()
