import type { NextConfig } from "next";

// Allow `next/image` to optimize remote previews coming from Backblaze B2.
// Presigned download URLs use the bucket-specific S3 hostname pattern:
//   <bucket>.s3.<region>.backblazeb2.com    (path-style and virtual-host)
//   s3.<region>.backblazeb2.com             (path-style)
// One wildcard covers every region + bucket, so this config drops in
// without per-deployment tweaks.
const nextConfig: NextConfig = {
  transpilePackages: ["@nextflow-genomics-object-storage/shared"],
  // Next.js 16's dev server only allow-lists `localhost` asset-origin requests
  // by default; it 403s the client bundle's chunk fetches when the app is
  // opened via 127.0.0.1 (e.g. `scripts/wait-ready.mjs` prints the 127.0.0.1
  // URL), which silently prevents hydration. Cover both loopback forms.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.backblazeb2.com",
      },
    ],
  },
};

export default nextConfig;
