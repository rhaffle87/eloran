import { describe, it, expect } from 'vitest';
import { ROUTE_METADATA } from '../../components/seo/seoMetadata.js';

describe('SEO & Metadata Architecture Verification', () => {
  const routes = ['/', '/loran-c', '/eloran', '/waveforms', '/learn', '/about'];

  it('defines metadata for all primary application routes', () => {
    routes.forEach((route) => {
      expect(ROUTE_METADATA[route], `Route ${route} should exist in ROUTE_METADATA`).toBeDefined();
    });
  });

  it('enforces unique, high-authority document titles with brand presence', () => {
    const titles = new Set();
    routes.forEach((route) => {
      const { title } = ROUTE_METADATA[route];
      expect(title).toBeTypeOf('string');
      expect(title.length).toBeGreaterThan(20);
      expect(title.includes('SIMULORAN')).toBe(true);
      expect(titles.has(title), `Duplicate title detected for route ${route}`).toBe(false);
      titles.add(title);
    });
  });

  it('enforces non-empty, unique meta descriptions within ideal SEO length', () => {
    const descriptions = new Set();
    routes.forEach((route) => {
      const { description } = ROUTE_METADATA[route];
      expect(description).toBeTypeOf('string');
      expect(description.length).toBeGreaterThanOrEqual(50);
      expect(description.length).toBeLessThanOrEqual(320);
      expect(descriptions.has(description), `Duplicate description detected for route ${route}`).toBe(false);
      descriptions.add(description);
    });
  });

  it('specifies valid Schema.org types for structured data rich snippets', () => {
    const validSchemas = ['WebApplication', 'TechArticle', 'AboutPage'];
    routes.forEach((route) => {
      const { schemaType } = ROUTE_METADATA[route];
      expect(validSchemas).toContain(schemaType);
    });
  });

  it('provides descriptive breadcrumb names for search hierarchy', () => {
    routes.forEach((route) => {
      const { breadcrumbName } = ROUTE_METADATA[route];
      expect(breadcrumbName).toBeTypeOf('string');
      expect(breadcrumbName.length).toBeGreaterThan(2);
    });
  });
});
