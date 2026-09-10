# Product

## Register

product

## Users

Bioinformaticians and clinical-genomics engineering teams evaluating Backblaze B2 as
the S3-compatible data lake for Nextflow pipeline runs — plus the AI/dev engineers who
wire that storage in. Their context: they run Nextflow (or nf-core) pipelines that read
large FASTQ inputs, stage terabytes of intermediate work, and publish BAM/VCF/QC
results, and they want those to live on cheap, S3-compatible object storage instead of
on-prem NFS or costly hyperscaler buckets. They want a working reference for pointing
Nextflow's `work-dir` and `--outdir` at B2, and a control plane to launch and inspect
runs.

## Product Purpose

A control plane for genomics pipeline **runs** (Next.js 16 + React 19 + Tailwind v4 +
shadcn/ui frontend, FastAPI backend) that uses Backblaze B2 as the terabyte-scale data
lake for inputs, work, and results. It ingests FASTQ to B2, launches a real Nextflow
run whose `workDir` and `--outdir` live on B2 over the S3-compatible API, and lets you
monitor status/logs and browse/download artifacts. A bundled Docker-free demo pipeline
makes it runnable in seconds on synthetic data. Success = a bioinformatics team can
clone it, point it at their bucket, launch a run, and see B2 working as the pipeline's
storage backend end to end — with every screen trustworthy enough to build on.

## Maturity and Support Boundary

This is a maintained open-source template/sample, not a complete hosted SaaS product.
It is built with production-minded controls and can be adapted for production use with
caution, but adopters own product-specific validation, security, deployment, and
operations. Repository defects and feature requests go through the public GitHub issue
tracker; B2 account, billing, service, and API questions go through Backblaze Support.
The template/sample itself is not covered by the Backblaze service level agreement,
and no SLA is provided for the repository software.

## Brand Personality

Confident, precise, quietly professional. Voice is direct and free of hype. The
interface should feel like a modern developer/scientific tool — considered, calm,
trustworthy — not a marketing showpiece. It is a **reference sample**: the design
carries craft through restraint and legibility (status, provenance, storage figures
read clearly), not through a loud identity of its own.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this kit exists to help builders avoid.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. It is scaffolding to be rebranded, not a hero page.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Must read as polished, dependable scaffolding.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **Practice what you preach.** The kit itself must model the engineering quality it
  asks agents to produce. Slop here propagates into every project built on it.
- **Neutral foundation, easy to rebrand.** Identity lives in tokens (`globals.css`) and
  one config file. Screens are built from the shared UI kit so a rebrand is a token
  swap, not a rewrite.
- **Earned familiarity over novelty.** Use standard, trusted affordances (top bar +
  side nav, command palette, data tables). The tool disappears into the task.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), and error (says what's wrong + offers retry) — never
  half-shipped.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, and a `prefers-reduced-motion`
alternative for every animation. Full light and dark theme parity.
