#!/usr/bin/env python3
"""
Test Data Generation Script for LocalDrop
Generates reproducible test files of specified sizes (e.g. 1MB, 100MB, 1GB, 5GB)
and calculates their exact SHA-256 digest to serve as ground-truth test vectors.
"""

import argparse
import hashlib
import os
import sys
import time

SIZES = {
    "1mb": 1 * 1024 * 1024,
    "100mb": 100 * 1024 * 1024,
    "500mb": 500 * 1024 * 1024,
    "1gb": 1 * 1024 * 1024 * 1024,
    "5gb": 5 * 1024 * 1024 * 1024,
}

def generate_file(filepath: str, target_bytes: int, block_size: int = 1024 * 1024) -> str:
    print(f"Generating '{filepath}' ({target_bytes / (1024 * 1024):.2f} MB)...")
    start = time.time()
    hasher = hashlib.sha256()

    # Deterministic pseudo-random pattern block to prevent filesystem over-compression artifacts
    pattern = bytearray((i % 251) for i in range(block_size))

    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    bytes_written = 0

    with open(filepath, "wb") as f:
        while bytes_written < target_bytes:
            chunk_len = min(block_size, target_bytes - bytes_written)
            chunk = memoryview(pattern)[:chunk_len]
            f.write(chunk)
            hasher.update(chunk)
            bytes_written += chunk_len

    elapsed = time.time() - start
    digest = hasher.hexdigest()
    speed = (target_bytes / (1024 * 1024)) / (elapsed if elapsed > 0 else 0.001)

    print(f"Done in {elapsed:.2f}s ({speed:.2f} MB/s)")
    print(f"SHA-256: {digest}")
    
    # Write checksum file
    with open(filepath + ".sha256", "w") as f:
        f.write(f"{digest}  {os.path.basename(filepath)}\n")

    return digest

def main():
    parser = argparse.ArgumentParser(description="Generate deterministic test data files for LocalDrop")
    parser.add_argument("--size", choices=list(SIZES.keys()) + ["all"], default="1mb", help="Size to generate")
    parser.add_argument("--outdir", default="target/test_data", help="Output directory")
    args = parser.parse_args()

    os.makedirs(args.outdir, exist_ok=True)

    targets = list(SIZES.keys()) if args.size == "all" else [args.size]
    for key in targets:
        bytes_to_write = SIZES[key]
        filepath = os.path.join(args.outdir, f"test_{key}.bin")
        generate_file(filepath, bytes_to_write)

if __name__ == "__main__":
    main()
