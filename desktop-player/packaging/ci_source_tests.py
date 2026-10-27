"""Bounded native source test process; run only on GitHub-hosted CI."""
import os
from pathlib import Path
import signal
import subprocess
import sys


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("Cloud runner required")
    out = Path("dist")
    out.mkdir(exist_ok=True)
    log = out / "source-tests.log"
    command = [sys.executable, "-u", "-m", "pytest", "-q"]
    print("Native source interpreter:", sys.executable, flush=True)
    options = {"start_new_session": True} if os.name != "nt" else {}
    timed_out = False
    with log.open("w", encoding="utf-8") as stream:
        process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT,
                                   env={**os.environ, "PYTHONUNBUFFERED": "1"}, **options)
        try:
            result = process.wait(timeout=180)
        except subprocess.TimeoutExpired:
            timed_out = True
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               timeout=20, check=False)
            else:
                os.killpg(process.pid, signal.SIGKILL)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
            result = 124
    print(log.read_text(encoding="utf-8", errors="replace"), flush=True)
    if timed_out:
        print("SOURCE_TEST_TIMEOUT: process exceeded 180 seconds", flush=True)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
