export type FileStatus = "uploading" | "complete" | "error";

export interface FileMetadata {
  key: string;
  filename: string;
  folder: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
}

export interface FileMetadataDetail {
  filename: string;
  size_bytes: number;
  size_human: string;
  mime_type: string;
  extension: string;
  md5: string;
  sha256: string;
  uploaded_at: string;
  /** Set when a format-specific extractor was skipped or failed (e.g. an image
   *  above the decompression-bomb decode limit). Core fields stay exact. */
  metadata_warning: string | null;
  // Image-specific
  image_width: number | null;
  image_height: number | null;
  exif: Record<string, string> | null;
  // PDF-specific
  pdf_pages: number | null;
  pdf_author: string | null;
  pdf_title: string | null;
  // Audio/Video
  duration_seconds: number | null;
  codec: string | null;
  bitrate: number | null;
}

export interface FileUploadResponse {
  key: string;
  filename: string;
  size_bytes: number;
  size_human: string;
  content_type: string;
  uploaded_at: string;
  url: string | null;
  metadata: FileMetadataDetail | null;
}

/** A short-lived presigned PUT the browser uploads a file directly to B2 with.
 *  `headers` are signed into the URL, so the browser must send them verbatim. */
export interface PresignUploadResponse {
  key: string;
  url: string;
  method: string;
  content_type: string;
  headers: Record<string, string>;
  expires_in: number;
}

export interface DailyUploadCount {
  date: string;
  uploads: number;
}

export interface UploadStats {
  total_files: number;
  total_size_bytes: number;
  total_size_human: string;
  uploads_today: number;
  total_downloads: number;
}

// --- Genomics pipeline runs (primary entity) -------------------------------

export type RunStatus =
  | "ready"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked";

export type Pipeline = "demo" | "nf-core/sarek" | "nf-core/rnaseq";

export type Profile = "test" | "docker" | "singularity" | "standard";

export interface RunCreateRequest {
  name: string;
  pipeline: Pipeline;
  profile: Profile;
  samplesheet: string | null;
}

export interface RunManifest {
  run_id: string;
  name: string;
  pipeline: Pipeline;
  profile: Profile;
  samplesheet: string | null;
  status: RunStatus;
  message: string | null;
  command: string | null;
  work_dir: string;
  outdir: string;
  exit_code: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface StageSize {
  stage: string;
  prefix: string;
  object_count: number;
  size_bytes: number;
  size_human: string;
}

export interface RunDetail {
  manifest: RunManifest;
  stages: StageSize[];
}

export interface ResultArtifact {
  key: string;
  name: string;
  category: string;
  size_bytes: number;
  size_human: string;
  modified_at: string;
}

export interface RunLog {
  run_id: string;
  log: string;
  present: boolean;
}

export interface GenomicsStats {
  total_runs: number;
  ready: number;
  running: number;
  succeeded: number;
  failed: number;
  blocked: number;
  result_artifacts: number;
  storage: StageSize[];
}
