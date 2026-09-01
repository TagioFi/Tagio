#!/usr/bin/env python3
"""
TagioFi Public Repo Sync Script
================================
Syncs the local `master` branch to the public Open Source repository (TagioFi/Tagio)
while rewriting all commit authors & committers to:
  TagioFi <tagiofi@outlook.com>

Keeps the primary `origin` (notadeveloper7/tagiopay) untouched with NAD7 credentials.
"""

import os
import sys
import subprocess

PUBLIC_AUTHOR_NAME = "TagioFi"
PUBLIC_AUTHOR_EMAIL = "tagiofi@outlook.com"
REMOTE_PUBLIC = "origin-public"
TARGET_BRANCH = "master"
LOCAL_EXPORT_REF = "public-master"

def main():
    print(f"🚀 [1/3] Exporting and rewriting commit history for {PUBLIC_AUTHOR_NAME} <{PUBLIC_AUTHOR_EMAIL}>...")

    # Fast export master -> rewrite stream -> fast import to public-master
    p1 = subprocess.Popen(["git", "fast-export", TARGET_BRANCH], stdout=subprocess.PIPE)
    p2 = subprocess.Popen(["git", "fast-import", "--force", "--quiet"], stdin=subprocess.PIPE)

    inp = p1.stdout
    out = p2.stdin

    target_header = f"TagioFi <{PUBLIC_AUTHOR_EMAIL}>".encode("utf-8")

    while True:
        line = inp.readline()
        if not line:
            break

        if line.startswith(b"author "):
            parts = line.rstrip(b"\r\n").split(b" ")
            tz = parts[-1]
            t = parts[-2]
            out.write(b"author " + target_header + b" " + t + b" " + tz + b"\n")
        elif line.startswith(b"committer "):
            parts = line.rstrip(b"\r\n").split(b" ")
            tz = parts[-1]
            t = parts[-2]
            out.write(b"committer " + target_header + b" " + t + b" " + tz + b"\n")
        elif line.startswith(b"tagger "):
            parts = line.rstrip(b"\r\n").split(b" ")
            tz = parts[-1]
            t = parts[-2]
            out.write(b"tagger " + target_header + b" " + t + b" " + tz + b"\n")
        elif line.startswith(f"reset refs/heads/{TARGET_BRANCH}".encode("utf-8")):
            out.write(f"reset refs/heads/{LOCAL_EXPORT_REF}\n".encode("utf-8"))
        elif line.startswith(f"commit refs/heads/{TARGET_BRANCH}".encode("utf-8")):
            out.write(f"commit refs/heads/{LOCAL_EXPORT_REF}\n".encode("utf-8"))
        elif line.startswith(b"data "):
            count = int(line.split(b" ")[1])
            out.write(line)
            blob = inp.read(count)
            out.write(blob)
        else:
            out.write(line)

    out.close()
    p2.wait()
    p1.wait()

    if p1.returncode != 0 or p2.returncode != 0:
        print("❌ Error: Fast export/import failed!", file=sys.stderr)
        sys.exit(1)

    print(f"✨ [2/3] Local branch `{LOCAL_EXPORT_REF}` prepared with 100% TagioFi authorship.")

    # Push to origin-public
    print(f"📦 [3/3] Pushing `{LOCAL_EXPORT_REF}` to `{REMOTE_PUBLIC} {TARGET_BRANCH}`...")
    push_cmd = ["git", "push", REMOTE_PUBLIC, f"{LOCAL_EXPORT_REF}:{TARGET_BRANCH}", "--force"]
    res = subprocess.run(push_cmd)

    if res.returncode == 0:
        print(f"\n🎉 Successfully synced all commits to {REMOTE_PUBLIC} ({TARGET_BRANCH}) as {PUBLIC_AUTHOR_NAME}!")
    else:
        print(f"\n❌ Error: Push to {REMOTE_PUBLIC} failed with exit code {res.returncode}", file=sys.stderr)
        sys.exit(res.returncode)

if __name__ == "__main__":
    main()
