import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard/settings',
        '/dashboard/billing',
        '/admin/',
        '/_next/',
        '/tmp/',
      ],
    },
    sitemap: 'https://tldrsec.app/sitemap.xml',
  };
}