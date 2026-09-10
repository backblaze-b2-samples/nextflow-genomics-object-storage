# Synthetic demo inputs

`sample_a.fastq` and `sample_b.fastq` are **simulated** reads — hand-authored,
deterministic, and biologically meaningless. They exist only to exercise the
pipeline and the B2 staging path end to end.

**Never place real human genomic data here.** Real sequence data carries privacy
and consent obligations that this sample does not attempt to handle. The seed
script (`services/api/scripts/seed_inputs.py`) uploads these files to
`inputs/fastq/` on your bucket and writes a matching samplesheet to
`inputs/samplesheets/`, so a launched run stages its FASTQ from B2.
