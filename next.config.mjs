/** @type {import('next').NextConfig} */

// Security response headers applied to every route. The portal is a same-origin
// app (API + pages on one origin), so the policy locks external loading down
// hard while permitting the inline styles/scripts Next.js, Tailwind, and Radix
// emit at runtime. News content is rendered with rehype-sanitize (Phase 2b),
// so even a compromised publisher cannot inject script via markdown.
//
// dev vs prod: React's dev build uses eval() to reconstruct callstacks for
// debugging, so in development we add 'unsafe-eval' to script-src and drop
// HSTS (dev runs on http://localhost). Production never uses eval — React
// strips it — so prod CSP stays strict (no unsafe-eval).
const isDev = process.env.NODE_ENV !== 'production'

const baseHeaders = [
  // Defense against clickjacking: never allow the portal to be framed. This is
  // the CSP-native equivalent of X-Frame-Options: DENY.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Only send the origin (not full URL or referrer) to other origins, and
  // strip it entirely on downgrade. Same-origin navigations keep the full URL.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Prevent MIME-type sniffing on uploaded/served assets (uploads route serves
  // files by extension-derived Content-Type).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Lock down browser features the portal doesn't use.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

function cspHeader() {
  // script-src: 'unsafe-inline' for Next hydration scripts (+ 'unsafe-eval' in
  // dev for React's debug callstack reconstruction). Mitigated in prod by
  // rehype-sanitize stripping user-supplied <script> from news content.
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'"
  return {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      // News cover images and markdown images can be any https URL (admin-set);
      // data: covers inline SVG/raster used by some UI primitives.
      "img-src 'self' data: https:",
      // next/font self-hosts fonts; data: for any inlined fallback.
      "font-src 'self' data:",
      // Same-origin API only; SWR fetches are same-origin.
      "connect-src 'self'",
      // Block plugins/embeds entirely.
      "object-src 'none'",
      // Prevent <base> hijacking and cross-origin form posts.
      "base-uri 'self'",
      "form-action 'self'",
      // Equivalent to X-Frame-Options DENY, expressed in CSP.
      "frame-ancestors 'none'",
    ].join('; '),
  }
}

const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    // HSTS only in production — dev is http://localhost, where the header is
    // meaningless and can stick to localhost in some browsers.
    const headers = isDev
      ? [...baseHeaders, cspHeader()]
      : [
          ...baseHeaders,
          // HTTPS-only: the app is served behind an nginx + certbot TLS
          // terminator, so instruct browsers to always use https for a year.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          cspHeader(),
        ]
    return [
      {
        source: '/:path*',
        headers,
      },
    ]
  },
}

export default nextConfig
