#!/usr/bin/env python3
"""Toy aligner: emit a minimal, well-formed SAM (one record per read).

This is a BAM-shaped text artifact (SAM is the textual form of BAM). It exists to
demonstrate an alignment-stage output landing on B2 — it performs no real
alignment. Usage: align.py <reads.fastq[.gz]> <sample> <out.sam>
"""
import gzip
import sys

REF = "chrDemo"
REF_LEN = 1000


def _open(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path)


def main() -> int:
    reads_path, sample, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    header = [
        "@HD\tVN:1.6\tSO:unsorted",
        f"@SQ\tSN:{REF}\tLN:{REF_LEN}",
        f"@RG\tID:{sample}\tSM:{sample}",
        "@PG\tID:ngos-demo\tPN:ngos-demo\tVN:1.0",
    ]
    records = []
    name = seq = None
    idx = 0
    with _open(reads_path) as fh:
        for i, line in enumerate(fh):
            phase = i % 4
            if phase == 0:
                name = line.strip()[1:].split()[0]
            elif phase == 1:
                seq = line.strip()
            elif phase == 3:
                qual = line.strip()
                pos = 1 + (idx % max(1, REF_LEN - len(seq)))
                records.append(
                    "\t".join(
                        [
                            name,
                            "0",
                            REF,
                            str(pos),
                            "60",
                            f"{len(seq)}M",
                            "*",
                            "0",
                            "0",
                            seq,
                            qual,
                        ]
                    )
                )
                idx += 1
    with open(out_path, "w") as w:
        w.write("\n".join(header + records) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
