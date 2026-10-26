# Preparar A Mano para staging en Vercel

**Estado de esta revisión (25-10-2026): no desplegado y sin proyecto remoto.** Esta guía no crea proyectos, no conecta Supabase/Vercel ni ejecuta migraciones remotas. La web tiene SSR, Server Actions y autenticación por cookies; se debe desplegar como aplicación Next.js con servidor, no como exportación estática.

## Auditoría de compatibilidad

- `next.config.ts` está vacío y no fuerza `output: "export"`. Las rutas dinámicas, `proxy.ts`, cookies, Server Actions y handlers de fotos son compatibles con un despliegue Next.js SSR en Node.js. El handler de imágenes declara `runtime = "nodejs"` y usa Sharp; no hay `vercel.json` que cambie su runtime. La versión probada aquí fue Next.js 16.4.3 y Node 24.18. Vercel documenta Node 24.x disponible y como versión predeterminada actual; seleccionar 24.x en el proyecto mantiene el entorno alineado ([versiones Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).
- `npm ci` usa `package-lock.json`, pero `package.json` declara varias dependencias como `latest` (incluidos Next, React, TypeScript y ESLint). La instalación bloqueada por lockfile es reproducible hoy; una futura regeneración del lock puede incorporar cambios mayores inesperados. Antes de un ciclo de producción, fijá versiones revisadas y actualizá el lockfile en un cambio controlado.
- **Fotos y Vercel:** la migración incremental `202610250001_vercel_direct_professional_images.sql` y el código evitan pasar los bytes por Vercel: el navegador carga el original a una ruta temporal privada autorizada por RLS, una Function con JSON pequeño descarga/valida/recodifica y escribe el resultado sanitizado a la ruta final privada, y las páginas leen directamente desde Storage con RLS. El bucket mantiene el límite de 5 MiB, pero los bytes ya no pasan por el límite de request/response de 4.5 MB de Functions ([límites de Vercel Functions](https://vercel.com/docs/functions/limitations)). La finalización requiere `SUPABASE_SERVICE_ROLE_KEY` solo en servidor. La carga real todavía no se probó en Vercel ni contra Storage remoto.
- La copia de trabajo revisada no contiene un directorio `.git`; no se puede importar esta copia directamente mediante Vercel Git Integration. Conectá la versión correspondiente dentro del repositorio Git real que vayas a publicar. No se inicializó Git ni se hizo push.
- No existe proyecto Supabase remoto, dominio, despliegue, SMTP configurado ni prueba remota. Los resultados locales no certifican RLS, Auth, Storage, DNS, correo, disponibilidad ni restauración en un servicio alojado.

## Variables y secretos

La aplicación lee estas variables en runtime/build:

| Variable | Tipo | Valor que corresponde en staging |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | URL HTTPS del proyecto Supabase **remoto de staging** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública | Publishable key del mismo proyecto remoto |
| `NEXT_PUBLIC_APP_URL` | Pública | Origen HTTPS fijo de staging, sin barra final, por ejemplo `https://a-mano-staging.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreta, solo servidor** | Service role/secret key del mismo proyecto; solo finalización de imágenes, después de verificar sesión y reserva. |

`NEXT_PUBLIC_*` se incorpora al cliente. No pongas contraseñas, tokens ni claves secretas allí. La publishable key puede ser visible; RLS y Auth deben ser la autoridad para los datos.

`SUPABASE_SERVICE_ROLE_KEY` debe existir solo en el servidor de Vercel para finalizar fotos. Nunca la nombres `NEXT_PUBLIC_*`, la importes desde un módulo cliente, la incluyas en respuestas, logs o repositorio. La Function la usa después de `auth.getUser()` y una RPC autenticada owner-only, únicamente en el bucket fijo y ruta aleatoria reservada, con `upsert: false`. Las demás operaciones usan publishable key, sesión de usuario y RLS. La contraseña Postgres, el token de `supabase login` y las credenciales SMTP son secretos operativos: ingresalos solo en los paneles/prompts seguros. No reutilices valores locales Docker/Supabase en remoto.

Para desarrollo local, `.env.example` usa placeholders y `.env.local` está ignorado por Git. Después de cambiar variables locales, reiniciá Next. En Vercel configurá las cuatro variables para el entorno **Preview** de staging y reconstruí el deployment tras cada cambio; no uses el dominio único de un preview por commit como `NEXT_PUBLIC_APP_URL`.

## Orden seguro para crear Supabase remoto

1. En Supabase Dashboard, creá un proyecto **nuevo y separado para staging**. Elegí una región cercana a las personas que lo probarán. Guardá la contraseña de base de datos en un gestor seguro. No conectes producción ni una base con datos existentes a esta primera aplicación de migraciones.
2. Verificá que el proyecto recién creado no contenga tablas propias ni migraciones aplicadas manualmente. La carpeta local contiene, en orden, `202610240001_initial_schema.sql` hasta `202610240009_public_professional_images.sql`, `202610250001_vercel_direct_professional_images.sql`, `202610250002_recover_legacy_image_uploads.sql` y `202610250003_anon_storage_read_helper.sql`. La primera migración agrega las categorías iniciales; no se usa un archivo seed adicional.
3. En PowerShell, desde la carpeta que contiene `package.json` y `supabase/`, autenticá la CLI. `supabase login` guarda un token de plataforma en el almacén local de la CLI; no lo copies al código ni a Vercel:

   ```powershell
   Set-Location 'RUTA\AL\PROYECTO\a-mano'
   npm ci
   npx supabase login
   npx supabase projects list
   ```

4. Copiá el `project ref` del proyecto **staging** desde Dashboard y vinculá este checkout. El ref identifica el proyecto, pero no es una contraseña:

   ```powershell
   npx supabase link --project-ref PROJECT_REF_DE_STAGING
   npx supabase migration list --linked
   npx supabase db push --dry-run
   ```

   Revisá la salida antes de escribir. Para este proyecto vacío, el remoto debe aparecer sin migraciones propias pendientes de conciliar. Si aparecen versiones aplicadas, objetos creados desde Dashboard o diferencias inesperadas, frená y revisá el esquema y el historial; **no** uses `db reset --linked`, `migration repair` ni borres datos para forzar una coincidencia.
5. Si el `dry-run` enumera únicamente las migraciones esperadas, aplicá las migraciones incrementales pendientes al remoto vinculado y verificá el historial:

   ```powershell
   npx supabase db push
   npx supabase migration list --linked
   ```

   `db push` aplica migraciones no registradas; no hace falta ni se debe ejecutar `db reset`. Este comando remoto no reinicia la base Docker local. La guía oficial describe el flujo `link` → `db push --dry-run` → `db push` ([Supabase CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows)).
6. En Dashboard → Storage, confirmá que `amano-professional-images` existe, es **privado**, limita objetos a 5 MiB y acepta solo JPEG, PNG y WebP. Las migraciones crean políticas para rutas temporales reservadas y rutas finales; no agregues políticas públicas o de escritura general. El bucket local mantiene además su límite específico de 5 MiB.
7. En Dashboard, revisá Data API y Authentication: solo están expuestos los esquemas previstos (`public` y `graphql_public`); no agregues `private`. Dejá RLS activa y revisá políticas y grants en el proyecto remoto después de aplicar el historial.

El esquema usa RLS y los datos privados/moderación pasan por RPC autorizadas. Storage es privado: el propietario solo puede insertar en la ruta temporal reservada y borrar sus objetos; el cliente no puede escribir la ruta final. La lectura pública permite únicamente imágenes listas de perfiles aprobados/publicados y Storage comprueba la publicación en cada descarga. La Function valida `getUser()`, reserva owner-only, firma/contenido y dimensiones, recodifica y elimina EXIF; la service key solo escribe el resultado sanitizado después de esas verificaciones. No se usan URLs públicas ni firmadas de lectura. **Debe comprobarse en staging**, porque todavía no hay resultado remoto.

## Vercel, dominio y Auth

1. Importá en Vercel el repositorio Git real que contiene esta versión. Elegí Next.js, directorio raíz de la app (el que contiene `package.json`), `npm ci` y `npm run build`. No configures `output: export`, un runtime Edge global ni un `vercel.json` que convierta la app en estática. Seleccioná Node.js **24.x** en Settings → Build and Deployment → Node.js Version.
2. Para un primer enlace compartible, asigná un dominio estable al branch de staging (por ejemplo el `*.vercel.app` reservado para staging). Si luego usás un dominio propio, configurá DNS y HTTPS en Vercel y reemplazá el origen en `NEXT_PUBLIC_APP_URL`. El origen no debe terminar en `/`, porque la app agrega `/auth/callback` al construir links.
3. Vercel → Settings → Environment Variables: cargá las variables públicas y `SUPABASE_SERVICE_ROLE_KEY` como secreto de servidor en Preview/staging, solo con valores del Supabase remoto. Nunca agregues el secreto a un entorno cliente ni lo pegues en chat, logs o commits. Reconstruí el deployment después de agregarlas.
4. Supabase Dashboard → Authentication → URL Configuration:
   - **Site URL:** el origen estable del sitio de staging, sin `/auth/callback`.
   - **Redirect URLs:** agregá la ruta exacta `https://DOMINIO-STAGING/auth/callback`. Conservá `http://localhost:3000/auth/callback` solo si necesitás flujo local. Evitá `https://**.vercel.app/**` o comodines amplios: autorizá solo los hosts que controles. Supabase recomienda URL exacta para sitios estables y documenta las allowlists para redirects ([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)).
   - En Auth → Providers → Email, dejá habilitados signup y **confirmación de email** para staging. Configurá SMTP de un proveedor real verificado, remitente y límites de envío; el SMTP local de pruebas no entrega mensajes externos. Revisá templates de confirmación y recuperación: el flujo de la app envía `redirectTo` a `/auth/callback` y puede requerir que el template use `{{ .RedirectTo }}`. Probá con una casilla controlada que los dos enlaces regresen al dominio staging y terminen, respectivamente, en cuenta y restablecimiento de contraseña.
   - El flujo de recuperación usa la ruta `/auth/callback?next=%2Frestablecer`; el callback valida el código PKCE y solo permite destinos internos.
5. Para pruebas por commit, no permitas que un dominio preview variable se use como destino de Auth si no añadiste una regla limitada y la verificaste. La opción más simple es compartir solo el dominio estable de staging. No agregues wildcards generales para “hacer que funcione”.

Vercel Preview deployments pueden ser accesibles públicamente según la protección de deployments del proyecto. Antes de compartir, decidí si limitarás el acceso con Deployment Protection. Para pruebas externas, usá cuentas y contenido de prueba consentido; no cargues datos personales de terceros.

## Primer administrador remoto

No hay endpoint web para asignar roles. El usuario primero se registra normalmente en el proyecto **remoto**, confirma su email y se verifica su email exacto en `auth.users`. Luego, desde una sesión confiable de Postgres como `postgres` o `supabase_admin`, ejecutá el mecanismo ya implementado:

```sql
select private.manage_admin_role('UUID_DEL_USUARIO_CONFIRMADO', true);
```

En Supabase Dashboard → SQL Editor, verificá primero `select session_user;` y usalo solo si el resultado cumple el rol de sesión que valida la función (`postgres` o `supabase_admin`). Consultá el usuario por el email exacto y comprobá `email_confirmed_at is not null` antes de usar su UUID. Si SQL Editor no ejecuta con ese rol, usá una conexión Postgres confiable con el rol permitido y contraseña ingresada de forma interactiva; no cambies la función ni relajes su comprobación. No uses `user_metadata`, una tabla pública editable, un endpoint, publishable key o una service/secret key. La función no concede `EXECUTE` a `anon`/`authenticated`, escribe auditoría y protege al último administrador. Después iniciá sesión y comprobá `/admin/moderacion`.

## Bloqueos antes de aceptar usuarios reales

1. **Fotos en Vercel:** aplicar las doce migraciones, configurar la service key server-only y probar en Preview cargas cerca de 5 MiB, firma/MIME inválidos, descarga pública, acceso pendiente/suspendido, borrado y limpieza. No se probó una Function de Vercel ni un Storage remoto. No existe una tarea automática de conciliación de reservas/temporales abandonados; implementarla antes de escalar o gestionar una conciliación operativa revisada.
2. **Legal y soporte:** `src/app/privacidad/page.tsx` y `src/app/terminos/page.tsx` declaran que son borradores pendientes de revisión. La ruta de contacto indica que todavía no hay un canal publicado. La eliminación definitiva de cuenta tampoco está implementada (documentada en `docs/supabase.md`). Preparar textos revisados, contacto de soporte y un flujo de eliminación antes de admitir cuentas de usuarios reales fuera de una prueba cerrada.
3. **Auth de staging:** crear proyecto Supabase, SMTP y URLs de confirmación/recuperación, aplicar configuración, probar correos y revisar límites de Auth. La configuración SMTP y links remotos no se han probado.
4. **Operación:** definir responsables, backups/restauración, monitoreo y respuesta a incidentes. La app devuelve mensajes genéricos y no tiene un logger/servicio de errores configurado; no registres contraseñas, tokens, bodies de formularios ni URLs de recuperación al agregar observabilidad. Activá CAPTCHA/rate limits si vas a dejar el registro abierto y exigí MFA al equipo administrativo cuando esté disponible y verificado.
5. **Migraciones y permisos remotos:** comprobar historial, RLS, grants, bucket/policies y Auth con la app de staging y usuarios de prueba separados. Las pruebas pgTAP locales no son una certificación del proyecto alojado.
6. **Repositorio/deployment:** conectar la fuente Git correcta, configurar el dominio estable y verificar una build real en Vercel. Nada de eso se ejecutó desde esta revisión.

## Orden para compartir la URL de staging

1. Configurar la clave privada solo de servidor y definir cómo manejar temporales abandonados mientras no exista conciliación automática.
2. Completar documentos legales, contacto y política de acceso de testers.
3. Crear el proyecto Supabase remoto staging vacío; aplicar y verificar las doce migraciones con el flujo anterior.
4. Configurar el primer admin confirmado mediante conexión confiable, Auth/SMTP, Storage privado, URLs exactas y variables públicas.
5. Conectar el repositorio Git real a Vercel; desplegar branch de staging con Node 24.x.
6. Probar registro/confirmación, ingreso/cierre, recuperación, perfil, publicación pendiente, aprobación/rechazo, búsqueda anónima, privacidad RLS, Storage, logs y móvil en la URL HTTPS.
7. Solo después compartir el dominio estable con el grupo previsto. **No promover este deployment a producción ni usar datos reales sensibles** como resultado de esta guía.

## Verificaciones ejecutadas en esta revisión

Docker mostraba arriba el stack local (`supabase_db_a-mano` escuchando en 54322); el comando de pruebas usa esa base local. `npm run test:db` se ejecutó sin conectar remoto y falló porque la base local ya contiene datos de la aplicación: algunos tests asumen que no hay otros administradores ni profesionales aprobados y comparan conteos globales. Los SQL de pgTAP están envueltos en transacciones con `ROLLBACK`, así que no se borró ni reseteó la base existente. No uses `db reset` para ocultar esta limitación; la suite debe ejecutarse en una instancia local desechable/aislada o ajustarse a fixtures aislados antes de ser una comprobación repetible en una base persistente.

En esta revisión no se ejecutó ningún `supabase link`, `db push`, `db reset`, deploy, push de Git ni llamada a un servicio remoto.
