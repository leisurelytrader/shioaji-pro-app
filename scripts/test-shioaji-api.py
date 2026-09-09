#!/usr/bin/env python3
"""Check the locally running official Shioaji Pro API.

Usage:
  python test-shioaji-api.py
  python test-shioaji-api.py --port 21322 --timeout 5
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def get_json(url: str, timeout: float):
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return response.status, json.loads(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description="Test local Shioaji Pro API health")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=21322)
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    base = f"http://{args.host}:{args.port}"
    health_url = f"{base}/api/v1/health"
    print(f"Testing {health_url}")

    try:
        status_code, payload = get_json(health_url, args.timeout)
    except urllib.error.HTTPError as exc:
        print(f"FAIL: HTTP {exc.code} from {health_url}")
        return 2
    except urllib.error.URLError as exc:
        print(f"FAIL: cannot connect to {base}: {exc.reason}")
        print("Start the official Shioaji Pro app and complete login first.")
        return 1
    except TimeoutError:
        print(f"FAIL: timeout after {args.timeout:g}s")
        return 1
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"FAIL: response was not valid JSON: {exc}")
        return 2
    except Exception as exc:  # pragma: no cover - diagnostic fallback
        print(f"FAIL: {type(exc).__name__}: {exc}")
        return 2

    healthy = payload.get("status") == "healthy"
    print(f"HTTP status: {status_code}")
    print(f"API status:  {payload.get('status', '<missing>')}")
    print(f"Version:     {payload.get('version', '<unknown>')}")
    print(f"Token stale: {payload.get('token_stale', '<unknown>')}")
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if healthy:
        print("PASS: Shioaji API is healthy and reachable.")
        return 0
    print("FAIL: API is reachable, but it is not healthy yet.")
    return 3


if __name__ == "__main__":
    sys.exit(main())
