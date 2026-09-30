import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes deshabilitado hasta tener todas las rutas del menú.
  // Activar más adelante: experimental: { typedRoutes: true }
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    // Baileys y sus deps opcionales (jimp/sharp/link-preview-js) deben quedar
    // fuera del bundle de webpack: usan dynamic import con catch y solo se
    // resuelven en runtime en el server.
    "@whiskeysockets/baileys",
    "@hapi/boom",
    "pino",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Las dependencias opcionales de Baileys no las usamos; las marcamos
      // como externas para que webpack no falle al resolverlas.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        { jimp: "commonjs jimp", sharp: "commonjs sharp", "link-preview-js": "commonjs link-preview-js" },
      ];
    }
    // En el cliente (no debería pasar — Baileys es server-only) ignoramos.
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...config.resolve.fallback,
      jimp: false,
      sharp: false,
      "link-preview-js": false,
    };
    return config;
  },
};

export default nextConfig;
