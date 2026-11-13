import type { NextConfig } from "next";

const isDevelopment =
  process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment
      ? ["'unsafe-eval'"]
      : []),
    "https://apis.google.com",
    "https://www.gstatic.com",
  ].join(" "),
  [
    "connect-src",
    "'self'",
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "wss://*.firebaseio.com",
    "https://*.firebaseapp.com",
    "https://*.web.app",
    ...(isDevelopment
      ? ["ws:", "wss:"]
      : []),
  ].join(" "),
  "frame-src 'self' https://*.firebaseapp.com https://*.web.app",
  "worker-src 'self' blob:",
  ...(isDevelopment
    ? []
    : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "no-referrer",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "X-Robots-Tag",
    value:
      "noindex, nofollow, noarchive, nosnippet",
  },
  {
    key: "Strict-Transport-Security",
    value:
      "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  devIndicators: false,

  allowedDevOrigins: [
    "192.168.100.15",
  ],

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              "private, no-store, no-cache, max-age=0, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
