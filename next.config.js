/** @type {import('next').NextConfig} */
const nextConfig = {
  // There's no app/page.js — the frontend is a static, framework-free
  // SPA (public/index.html + style.css + app.js + mcp-tools.js). This
  // rewrite makes it the thing served at "/", while app/api/** still
  // handles the backend as ordinary Next.js Route Handlers.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
};

module.exports = nextConfig;
