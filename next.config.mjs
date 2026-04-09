/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESSENCIAL: Gera a pasta .next/standalone/server.js 
  // necessária para o seu script de instalação e o Systemd
  output: 'standalone', 

  typescript: {
    ignoreBuildErrors: true,
  },
  
  images: {
    unoptimized: true,
  },

  // Opcional: Se você usa variáveis de ambiente no lado do cliente
  // elas serão "congeladas" no momento do pnpm build no seu script
}

export default nextConfig