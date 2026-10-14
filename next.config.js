/** @type {import('next').NextConfig} */

// Production gets a content security policy. Previews skip it so Vercel's
// preview toolbar can load; every other header applies everywhere.
const csp = [
  "default-src 'self'",
  // Next's inline bootstrap and the first-visit intro script run inline.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self'",
  // The contact form posts to Formspree.
  "connect-src 'self' https://formspree.io",
  "form-action 'self' https://formspree.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const headers = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ...(process.env.VERCEL_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/:path*", headers }];
  },
};

module.exports = nextConfig;
