#!/usr/bin/env python3
"""Toy counts table: per-base composition + summary as a TSV.

Demonstrates a counts-stage artifact on B2. Usage:
counts.py <reads.fastq[.gz]> <sample> <out.tsv>
"""
import gzip
import sys


def _open(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path)


def main() -> int:
    reads_path, sample, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    counts = {"A": 0, "C": 0, "G": 0, "T": 0, "N": 0}
    reads = 0
    with _open(reads_path) as fh:
        for i, line in enumerate(fh):
            if i % 4 == 1:
                reads += 1
                for base in line.strip().upper():
                    counts[base if base in counts else "N"] += 1
    total = sum(counts.values()) or 1
    with open(out_path, "w") as w:
        w.write("feature\tcount\tfraction\n")
        w.write(f"reads\t{reads}\t1.0\n")
        for base in ("A", "C", "G", "T", "N"):
            w.write(f"base_{base}\t{counts[base]}\t{round(counts[base] / total, 4)}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
