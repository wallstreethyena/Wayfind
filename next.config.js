/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // v4.54 PROTECTED (check-canon.mjs): any request arriving on a *.vercel.app
  // deployment URL is permanently redirected to the canonical domain, same
  // path and query. Old links to stale deployments bounce to production
  // instead of showing users a frozen old build.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<sub>.*)\\.vercel\\.app" }],
        destination: "https://www.gowayfind.com/:path*",
        permanent: true,
      },
    ];
  },
};
module.exports = nextConfig;
