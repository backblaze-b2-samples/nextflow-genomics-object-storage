#!/usr/bin/env python3
"""Toy variant caller: emit a minimal, spec-valid VCF 4.2.

Deterministic pseudo-variants derived from read content — no real calling. It
demonstrates a variants-stage artifact on B2. Usage:
variants.py <reads.fastq[.gz]> <sample> <out.vcf>
"""
import gzip
import sys

REF = "chrDemo"
ALT = {"A": "G", "C": "T", "G": "A", "T": "C", "N": "A"}


def _open(path):
    return gzip.open(path, "rt") if path.endswith(".gz") else open(path)


def main() -> int:
    reads_path, sample, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    seqs = []
    with _open(reads_path) as fh:
        for i, line in enumerate(fh):
            if i % 4 == 1:
                seqs.append(line.strip())
    # One toy SNV per read, at a stable position, ref/alt from the base seen.
    rows = []
    for idx, seq in enumerate(seqs):
        if not seq:
            continue
        pos = 10 + idx * 7
        ref_base = seq[len(seq) // 2].upper()
        alt_base = ALT.get(ref_base, "A")
        depth = len(seq)
        rows.append(
            "\t".join(
                [REF, str(pos), ".", ref_base, alt_base, "40", "PASS", f"DP={depth}"]
            )
        )
    header = [
        "##fileformat=VCFv4.2",
        f"##source=ngos-demo:{sample}",
        f"##contig=<ID={REF},length=1000>",
        '##INFO=<ID=DP,Number=1,Type=Integer,Description="Read depth">',
        "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO",
    ]
    with open(out_path, "w") as w:
        w.write("\n".join(header + rows) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
