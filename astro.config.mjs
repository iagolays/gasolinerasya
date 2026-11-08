// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/site.config.ts';
import { getMunicipalities, isIndexableMunicipality, municipalityPath } from './src/lib/data.ts';

// Páginas que no se incluyen en el sitemap (y que llevan noindex en su <Seo>).
// El 404 lo excluye ya la integración.
const NO_SITEMAP = ['/privacidad/', '/cookies/', '/aviso-legal/'];

// Fichas de gasolinera y municipios pequeños: noindex para no llenar el índice de páginas
// casi iguales (AdSense rechazó el sitio por «contenido de poco valor» el 2026-11-08).
// Se calcula al filtrar, cuando ya existe dataset.json.
/** @type {Set<string> | undefined} */
let thinMunis;
/** @param {string} path */
const isThin = (path) => {
  if (path.startsWith('/gasolinera/')) return true;
  thinMunis ??= new Set(getMunicipalities().filter((m) => !isIndexableMunicipality(m)).map(municipalityPath));
  return thinMunis.has(path);
};

// Fecha del build: los precios cambian cada hora, así que todas las páginas se
// consideran modificadas en cada despliegue.
const buildDate = new Date();

/**
 * Devuelve el item solo si su ruta empieza por `prefix` (para agrupar en chunks).
 * @param {string} prefix
 */
const byPrefix = (prefix) => (/** @type {{ url: string }} */ item) =>
  new URL(item.url).pathname.startsWith(prefix) ? item : undefined;

// https://astro.build/config
export default defineConfig({
  site: SITE.url,
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return !NO_SITEMAP.includes(path) && !isThin(path);
      },
      lastmod: buildDate,
      // Se reparten por tipo de página, enlazados desde sitemap-index.xml:
      // sitemap-provincias-0.xml (provincias y municipios indexables) y sitemap-pages-0.xml
      // (portada, guías, marcas...). Las fichas de gasolinera ya no entran (noindex).
      entryLimit: 10000,
      chunks: {
        provincias: byPrefix('/provincia/'),
      },
    }),
  ],
});
