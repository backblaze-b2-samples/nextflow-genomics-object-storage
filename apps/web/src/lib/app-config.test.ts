import { describe, expect, it } from "vitest";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config";

describe("app identity", () => {
  it("ships the canonical app name and description", () => {
    expect(APP_NAME).toBe("Nextflow Genomics Object Storage");
    expect(APP_DESCRIPTION).toBe(
      "Genomics pipeline data lake on Backblaze B2 — Nextflow runs that stage inputs from and publish results to B2 (workDir stays local for this demo)"
    );
  });
});
