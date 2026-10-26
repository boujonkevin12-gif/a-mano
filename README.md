# A Mano

Marketplace de servicios locales, con inicio en Concepción del Uruguay, Entre Ríos. Web en Next.js App Router, TypeScript y Tailwind CSS. Requiere Node.js 20.9 o posterior.

## Iniciar la web

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Completá las variables de `.env.local` según [la guía de Supabase](docs/supabase.md). Sin ellas, la landing y las pantallas siguen funcionando y explican que las cuentas y los datos no están conectados.

Abrí [http://localhost:3000](http://localhost:3000).

## Comprobaciones

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:db
```

`test:db` usa Supabase CLI y necesita que Docker Desktop esté en marcha. Las pruebas verifican RLS, moderación y acceso privado a imágenes.

## Estructura

- `src/app`: rutas públicas, cuenta, autenticación, resultados y Server Actions.
- `src/components`: navegación, formularios mobile-first y fichas profesionales.
- `src/lib/supabase`: cliente SSR con cookies, actualización de sesión, tipos y consultas públicas.
- `supabase/migrations`: esquema inicial, políticas RLS, vistas y RPCs.
- `supabase/tests/database`: pruebas pgTAP de permisos.
- `docs`: configuración de Supabase, [guía de staging en Vercel](docs/staging-deployment.md) y plan de publicación móvil.

## Estado

La búsqueda, los perfiles profesionales y la carga privada de fotos están conectados con Supabase. Para iniciar localmente, aplicá las migraciones pendientes como indica [docs/supabase.md](docs/supabase.md). No hay negocios ni reseñas de ejemplo. La aprobación de profesionales es administrativa y no se asigna desde el navegador. Las fotos se guardan privadas y solo aparecen públicamente si el perfil está aprobado y publicado.

El proyecto todavía no tiene Supabase remoto ni deployment verificado. La [auditoría y guía de staging](docs/staging-deployment.md) documenta los pasos pendientes. Las fotos usan Storage directo para no pasar archivos por el límite de payload de Vercel Functions; ese flujo aún debe probarse contra un proyecto Supabase remoto y un deployment Preview.

La estrategia para las tiendas está documentada en [docs/mobile-release.md](docs/mobile-release.md). Capacitor todavía no está instalado: el modo de exportación estática de Next.js no es compatible con las Server Actions, el Proxy de renovación de sesión y las cookies usados por la web.
