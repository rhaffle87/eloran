import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ROUTE_METADATA, BASE_URL } from './seoMetadata.js';

export default function SEOHead() {
  const location = useLocation();
  const pathname = location.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const meta = ROUTE_METADATA[pathname] || ROUTE_METADATA['/'];

  useEffect(() => {
    // 1. Update Document Title
    document.title = meta.title;

    // 2. Helper to set or update meta tag
    const setMetaTag = (attrName, attrVal, content) => {
      let tag = document.querySelector(`meta[${attrName}="${attrVal}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attrName, attrVal);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    // 3. Update Standard Meta Tags
    setMetaTag('name', 'description', meta.description);

    // 4. Update Canonical URL
    const canonicalHref = `${BASE_URL}${pathname === '/' ? '' : pathname}`;
    let canonicalTag = document.querySelector('link[rel="canonical"]');
    if (!canonicalTag) {
      canonicalTag = document.createElement('link');
      canonicalTag.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalTag);
    }
    canonicalTag.setAttribute('href', canonicalHref);

    // 5. Update Open Graph Tags
    setMetaTag('property', 'og:title', meta.title);
    setMetaTag('property', 'og:description', meta.description);
    setMetaTag('property', 'og:url', canonicalHref);

    // 6. Update Twitter Card Tags
    setMetaTag('name', 'twitter:title', meta.title);
    setMetaTag('name', 'twitter:description', meta.description);
    setMetaTag('name', 'twitter:url', canonicalHref);

    // 7. Inject Route-Specific JSON-LD Schema
    const scriptId = 'simuloran-route-schema';
    let scriptTag = document.getElementById(scriptId);
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = scriptId;
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }

    const jsonLdGraph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': meta.schemaType || 'WebApplication',
          name: meta.title,
          url: canonicalHref,
          description: meta.description,
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'Web Browser',
          isPartOf: {
            '@type': 'WebSite',
            name: 'SIMULORAN',
            url: BASE_URL,
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'Home',
              item: BASE_URL,
            },
            ...(pathname !== '/'
              ? [
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: meta.breadcrumbName,
                    item: canonicalHref,
                  },
                ]
              : []),
          ],
        },
      ],
    };

    scriptTag.textContent = JSON.stringify(jsonLdGraph, null, 2);
  }, [pathname, meta]);

  return null;
}
