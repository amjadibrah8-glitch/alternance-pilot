import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les fonctions Inngest et l'IA tournent côté serveur uniquement.
  serverExternalPackages: [],
};

export default nextConfig;
