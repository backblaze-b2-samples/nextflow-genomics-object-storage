#!/usr/bin/env python3
"""Toy read QC: read count, GC%, and mean Phred base quality.

Usage: qc.py <reads.fastq[.gz]> <sample> <out.json>
"""
import gzip
import json
import sys


def _open(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path)


def main() -> int:
    reads_path, sample, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    reads = bases = gc = qsum = qn = 0
    with _open(reads_path) as fh:
        for i, line in enumerate(fh):
            phase = i % 4
            if phase == 1:
                seq = line.strip()
                reads += 1
                bases += len(seq)
                gc += sum(1 for c in seq if c in "GCgc")
            elif phase == 3:
                q = line.strip()
                qsum += sum(ord(c) - 33 for c in q)
                qn += len(q)
    report = {
        "sample": sample,
        "reads": reads,
        "bases": bases,
        "gc_percent": round(100.0 * gc / bases, 2) if bases else 0.0,
        "mean_base_quality": round(qsum / qn, 2) if qn else 0.0,
    }
    with open(out_path, "w") as w:
        json.dump(report, w, indent=2)
        w.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
