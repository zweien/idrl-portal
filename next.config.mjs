/** @type {import('next').NextConfig} */

// Security response headers applied to every route. The portal is a same-origin
// app (API + pages on one origin), so the policy locks external loading down
// hard while permitting the inline styles/scripts Next.js, Tailwind, and Radix
// emit at runtime. News content is rendered with rehype-sanitize (Phase 2b),
// so even a compromised publisher cannot inject script via markdown.
const securityHeaders = [
  // HTTPS-only: the app is served behind an nginx + certbot TLS terminator, so
  // instruct browsers to always use https and to remember it for a year.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
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
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js emits inline hydration scripts; Tailwind/Radix use inline styles.
      // A nonce-based policy is stricter but requires middleware plumbing; until
      // then, 'unsafe-inline' for script is gated by rehype-sanitize stripping
      // user-supplied <script> from news content (Phase 2b).
      "script-src 'self' 'unsafe-inline'",
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
  },
]

const nextConfig = {
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
