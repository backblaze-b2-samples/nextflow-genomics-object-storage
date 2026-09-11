#!/usr/bin/env nextflow

/*
 * Nextflow Genomics Object Storage — bundled demo pipeline (DSL2).
 *
 * A Docker-free, reference-genome-free pipeline that runs anywhere Nextflow +
 * Java are installed. It reads a samplesheet + FASTQ staged from Backblaze B2,
 * runs four toy processes (QC, a minimal alignment, a spec-valid minimal VCF,
 * and a counts table), and publishes every artifact back to B2 under
 * `results/<run_id>/{qc,align,variants,counts}/`.
 *
 * The processes are pure Python (see `bin/`), so there are no container or
 * bioinformatics-tool dependencies — the point of this sample is the storage
 * layer (B2 as the S3 work + results store), not the science. For a realistic
 * workload, point a run at `nf-core/sarek` or `nf-core/rnaseq -profile test`
 * with the same B2-backed `-work-dir` / `--outdir`.
 *
 * Inputs are SYNTHETIC (simulated reads) — never real human genomic data.
 */

nextflow.enable.dsl = 2

params.input  = null        // s3:// samplesheet CSV with columns: sample,fastq
params.outdir = 'results'   // set to s3://<bucket>/results/<run_id> by the app
params.run_id = 'demo'

process QC {
    tag "${sample}"
    publishDir "${params.outdir}/qc", mode: 'copy'

    input:
    tuple val(sample), path(reads)

    output:
    path "${sample}.qc.json"

    script:
    "qc.py ${reads} ${sample} ${sample}.qc.json"
}

process ALIGN {
    tag "${sample}"
    publishDir "${params.outdir}/align", mode: 'copy'

    input:
    tuple val(sample), path(reads)

    output:
    path "${sample}.sam"

    script:
    "align.py ${reads} ${sample} ${sample}.sam"
}

process VARIANTS {
    tag "${sample}"
    publishDir "${params.outdir}/variants", mode: 'copy'

    input:
    tuple val(sample), path(reads)

    output:
    path "${sample}.vcf"

    script:
    "variants.py ${reads} ${sample} ${sample}.vcf"
}

process COUNTS {
    tag "${sample}"
    publishDir "${params.outdir}/counts", mode: 'copy'

    input:
    tuple val(sample), path(reads)

    output:
    path "${sample}.counts.tsv"

    script:
    "counts.py ${reads} ${sample} ${sample}.counts.tsv"
}

workflow {
    if( !params.input )
        error "Provide --input <samplesheet.csv> (columns: sample,fastq). Seed one with scripts/seed_inputs.py."

    Channel
        .fromPath(params.input)
        .splitCsv(header: true)
        .map { row -> tuple(row.sample, file(row.fastq)) }
        .set { samples }

    QC(samples)
    ALIGN(samples)
    VARIANTS(samples)
    COUNTS(samples)

    workflow.onComplete = {
        log.info "Run ${params.run_id} ${workflow.success ? 'succeeded' : 'failed'}. Results: ${params.outdir}"
    }
}
