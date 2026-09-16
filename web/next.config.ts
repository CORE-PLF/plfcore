import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // conteúdo comercial consolidado na landing única (âncoras)
      { source: '/produto', destination: '/#modulos', permanent: true },
      { source: '/como-funciona', destination: '/#modulos', permanent: true },
      { source: '/transparencia', destination: '/legal/privacidade', permanent: true },
      { source: '/faq', destination: '/#faq', permanent: true },
      { source: '/afiliados', destination: '/#programas', permanent: true },
      { source: '/revendedores', destination: '/#programas', permanent: true },
      // /planos?intent=nova vem do painel (nova instalação) — o parâmetro precisa sobreviver
      {
        source: '/planos',
        has: [{ type: 'query', key: 'intent', value: 'nova' }],
        destination: '/?intent=nova#planos',
        permanent: false,
      },
      { source: '/planos', destination: '/#planos', permanent: true },
    ]
  },
}

export default nextConfig
