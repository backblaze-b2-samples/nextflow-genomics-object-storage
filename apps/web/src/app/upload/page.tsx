import { UploadForm } from "@/components/upload/upload-form";

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Upload</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Ingest FASTQ reads and samplesheets (CSV/TSV) for Nextflow pipeline
          runs — drag files in or click to browse. Up to 100 MB per file.
          Uploaded samplesheets and FASTQ reads land in the same{" "}
          <code>inputs/</code> location the Create Run dialog scans, so they
          appear in its samplesheet dropdown automatically — make sure your
          samplesheet&apos;s <code>fastq</code> column points at{" "}
          <code>
            s3://&lt;bucket&gt;/inputs/fastq/&lt;name&gt;.fastq
          </code>{" "}
          for reads uploaded here. To launch a run against the bundled demo
          pipeline instead, use{" "}
          <span className="font-medium">Seed demo inputs</span> in the New run
          dialog.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <UploadForm />
      </div>
    </div>
  );
}
