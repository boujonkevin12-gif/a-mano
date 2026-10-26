# Configurar Supabase

## Proyecto local

1. Instalá Docker Desktop y dejalo iniciado. El proyecto incluye Supabase CLI como dependencia de desarrollo.
2. En la raíz de `a-mano`, ejecutá:

   ```bash
   npx supabase start
   ```

3. Iniciá el stack local y aplicá solo migraciones pendientes sin resetear la base:

   ```bash
   npx supabase migration up --local
   npm run test:db
   ```

   `npx supabase db reset` es destructivo: recrea la base y aplica todas las migraciones. Usalo únicamente en un proyecto local descartable cuyos datos quieras borrar. El correo local se inspecciona en el servicio SMTP de pruebas que informa `npx supabase status`.
4. Copiá el `API URL` y la `Publishable key` que muestra el CLI a `.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

5. Iniciá Next.js con `npm run dev`. El proyecto local requiere confirmar el correo; abrí el mensaje de prueba en el correo local antes de iniciar sesión.

La configuración del CLI permite redirecciones locales únicamente al callback de autenticación. Si abrís Next desde otro host/puerto, agregalo explícitamente a `auth.additional_redirect_urls` en `supabase/config.toml`.

## Proyecto remoto de staging

La guía paso a paso para crear un proyecto remoto nuevo, vincularlo con Supabase CLI desde Windows, aplicar las doce migraciones sin resetear la base local y conectarlo a Vercel está en [Preparar staging en Vercel](staging-deployment.md). No se creó ni vinculó ningún proyecto remoto desde este repositorio.

La aplicación consume `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_APP_URL` (públicas) y, para finalizar las cargas de fotos, `SUPABASE_SERVICE_ROLE_KEY` (privada, solo servidor). La clave privada solo se usa en la ruta de finalización tras autenticar al usuario y comprobar por RPC que la reserva le pertenece; se limita a escribir o compensar la ruta final exacta del bucket. Nunca la agregues a `NEXT_PUBLIC_*`, componentes cliente, `.env.example` con un valor, logs o repositorio. No se requiere `DATABASE_URL` para servir la web. La publishable key queda visible en el cliente por diseño; RLS y Auth autorizan cada acceso. No uses URL ni claves que imprime Docker/Supabase local en el proyecto remoto.

Antes de permitir registros de personas fuera del grupo de prueba, configurá confirmación de correo, SMTP verificado, URLs de callback exactas y límites adecuados en Auth. Los servidores SMTP, contraseñas de base y tokens de Supabase CLI se guardan en sus paneles o almacenes seguros, nunca en `NEXT_PUBLIC_*` ni en archivos versionados.

## Fotos profesionales (Supabase Storage)

La migración `202610240005_professional_storage.sql` crea el bucket `amano-professional-images` como **privado**, fija un máximo de 5 MiB por objeto y permite únicamente JPEG, PNG y WebP. La configuración local repite estos límites en `supabase/config.toml`; la migración es la fuente de verdad en la base y también crea las políticas Storage. La migración incremental `202610250001_vercel_direct_professional_images.sql` separa la ruta privada temporal (`uploading/...`) de la ruta final.

El archivo original se sube directamente desde el navegador autenticado a Storage mediante `@supabase/ssr` y la sesión de cookies. La Function recibe únicamente JSON de reserva y finalización (no el archivo completo); así evita el límite de 4.5 MB de request/response de Vercel. La política Storage permite `INSERT` solo al titular con una reserva activa y únicamente en su ruta temporal; no permite al cliente escribir en la ruta final. En finalización, el servidor vuelve a comprobar `auth.getUser()` y consulta una RPC owner-only para obtener rutas/metadatos. El cliente de Storage privilegiado está en un módulo `server-only`, usa `SUPABASE_SERVICE_ROLE_KEY` únicamente en servidor y no se entrega al navegador. El servidor descarga el temporal con la sesión de usuario, verifica tamaño, MIME, extensión y firma real, decodifica y recodifica con Sharp, elimina EXIF, limita salida a 5 MiB y 20 megapíxeles y escribe el resultado a la ruta final aleatoria con `upsert: false`. Acepta JPEG, PNG y WebP estáticos, una foto principal y hasta ocho trabajos por perfil; no acepta SVG ni animaciones.

Los metadatos mínimos quedan en `private.professional_images`, esquema que no está expuesto por PostgREST y sin permisos directos a roles de API. Storage RLS autoriza al titular a subir solo al temporal reservado, eliminar sus rutas y leer sus objetos; el público solo puede leer ruta final lista si el perfil está `approved` y `is_published`; administradores autorizados pueden revisar fotos listas en moderación. Las páginas reciben rutas finales solo desde RPC público filtrado o RPC administrativo autorizado y descargan las imágenes directamente desde el bucket privado con la publishable key y RLS. No hay URL pública ni firmada; cada lectura pasa por Storage RLS, que vuelve a evaluar publicación y moderación. Una suspensión u ocultamiento corta nuevas descargas sin esperar a que expire una URL firmada. El handler binario `/api/professional-images/{id}` fue eliminado para no pasar respuestas de hasta 5 MiB por Vercel.

La carga y el borrado usan rutas aleatorias separadas y un flujo compensable, porque PostgreSQL y Storage no comparten transacción. La reserva limita cantidades por perfil y autoriza únicamente la ruta temporal; el original se sube con `upsert: false`; el servidor verifica y escribe la imagen limpia en ruta final; luego la RPC cambia el estado a lista. El original temporal se borra inmediatamente y su ruta se limpia de metadatos. Si algo falla, el original/ruta final quedan privados y el usuario puede reintentar borrado/limpieza; los metadatos no se borran mientras haya objetos. Los temporales abandonados por cierre del navegador o interrupción permanente pueden ocupar cupo: no existe una tarea automática de conciliación/TTL, debe agregarse antes de escalar o gestionarse mediante revisión operativa controlada.

### Aplicación local

1. Confirmá que Storage esté habilitado en `supabase/config.toml`, ejecutá `npx supabase start` y aplicá las migraciones pendientes sin resetear la base: `npx supabase migration up --local`.
2. Revisá en Supabase Studio → Storage que `amano-professional-images` exista, sea privado y tenga el límite de 5 MiB. El bucket no debe marcarse público ni deben crearse políticas adicionales abiertas.
3. Configurá en `.env.local` las variables públicas anteriores y `SUPABASE_SERVICE_ROLE_KEY` con el valor local privado que entrega la CLI para el stack local. `npx supabase status -o env` muestra secretos: consultalo solo en una terminal privada y copiá ese valor directamente al archivo local ignorado, sin pegarlo en chat ni commits. Reiniciá Next.js tras cambiar el entorno.
4. Iniciá sesión, guardá primero el perfil profesional y luego cargá una foto principal o fotos de trabajos. Para probar la visibilidad pública, aprobá el perfil desde el panel administrativo; un perfil pendiente no se mostrará a visitantes.

### Despliegue remoto (pendiente; no ejecutado desde este proyecto)

No se vinculó ni modificó ningún proyecto remoto. Antes de usar fotos en staging/producción, configurá Supabase Storage en el proyecto elegido, revisá respaldo e historial y aplicá migraciones incrementales con `npx supabase link --project-ref …`, `npx supabase migration list`, `npx supabase db push --dry-run` y finalmente `npx supabase db push`. Confirmá que el bucket sea privado con límites y formatos esperados; verificá políticas RLS y exposición de esquemas. Configurá las tres variables públicas en Vercel y `SUPABASE_SERVICE_ROLE_KEY` como variable **secreta solo de servidor** en el entorno Preview de staging. No debe tener prefijo `NEXT_PUBLIC_`, ni usarse por código cliente. Rotá esa clave si se expone. Las lecturas y cargas originales pasan por Storage RLS con sesión de usuario; la clave solo escribe la imagen sanitizada a su ruta final tras comprobar identidad y propiedad.

No se configuraron transformación/CDN de imágenes ni un proceso automático para registros abandonados tras una caída permanente. Los errores transitorios dejan objetos privados y tombstones para reintento desde el perfil; una tarea operativa de conciliación automática es una mejora pendiente antes de escalar el volumen.

## Antes de producción

- Creá proyectos separados de staging y producción; este repositorio no está vinculado a un proyecto remoto y no se validaron credenciales ni servicios alojados.
- Revisá las migraciones pendientes antes de aplicarlas al proyecto elegido (`npx supabase migration list` y luego `npx supabase db push`); respaldá la base y validá primero en staging. No uses `db reset` en proyectos con datos que quieras conservar.
- Desplegá Next.js en un host que ejecute el servidor SSR y Server Actions. Esta app no es un export estático; configurá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_APP_URL` en el entorno de build/ejecución del host, sin secretos administrativos.
- Usá HTTPS, el dominio definitivo en el Site URL y callback allowlist exacto, SMTP verificado, límites de Auth adecuados y revisión de logs/backup/recuperación antes de aceptar usuarios reales.
- Después de crear en producción una cuenta de operador confirmada, otorgá el primer rol desde una conexión confiable a Postgres siguiendo el procedimiento anterior. No incluyas UUIDs de operadores, contraseñas ni claves en el código o variables `NEXT_PUBLIC_*`.
- Repetí pruebas de RLS/moderación en un entorno de staging con fixtures aislados. Las pruebas locales de pgTAP no demuestran por sí mismas que el proyecto remoto quedó bien configurado.

## Datos y permisos

- `profiles` guarda nombre visible, teléfono opcional y ciudad. Solo el titular puede consultar y actualizar esos campos.
- `professionals` no concede acceso directo por la Data API. El usuario envía o edita su perfil por `submit_own_professional_profile`; el RPC toma el titular del JWT autenticado, valida los campos, guarda categorías en una transacción y fuerza `status = 'pending'` e `is_published = false`.
- `public_professionals` expone solamente las columnas públicas de registros aprobados y publicados. No incluye `user_id`.
- `categories` permite lectura de categorías activas. `professional_categories` no tiene grants de cliente.
- La moderación está disponible en `/admin/moderacion`. La página y cada Server Action comprueban la sesión y el rol, y los RPC vuelven a autorizar la lectura/cambio dentro de Postgres. Los roles y el registro de auditoría viven en `private`, un esquema que no está expuesto por PostgREST. Las tablas tienen RLS y no conceden acceso directo a `anon` ni `authenticated`; no se utiliza `user_metadata`, un booleano editable ni una service key.
- El primer administrador se crea desde una sesión confiable de base de datos; el procedimiento requiere un usuario ya registrado y con email confirmado. Primero localizá su UUID en Authentication/Users o con una consulta restringida en SQL Editor; después ejecutá como `postgres`/`supabase_admin`:

  ```sql
  select private.manage_admin_role('UUID_DEL_USUARIO_CONFIRMADO', true);
  ```

  Para otorgar otro administrador, repetí el procedimiento con otro UUID confirmado. Para revocar uno, usá `false`; el último administrador no se puede revocar mediante esta función. La función no tiene `EXECUTE` para los roles de la API y también comprueba la sesión de base de datos, así que no puede llamarse desde el navegador. Mantené el UUID y el acceso al SQL Editor bajo control del equipo.
- El panel permite aprobar/publicar solicitudes pendientes, rechazarlas con motivo, ocultar publicaciones, volver a publicar aprobadas, suspenderlas y restablecerlas con motivo. Se verifican estado esperado y transición bajo bloqueo de fila para prevenir dobles acciones. Las transiciones administrativas quedan auditadas. Editar desde la cuenta del profesional vuelve a dejar el perfil pendiente y oculto.
- Los errores de políticas no se convierten en confirmaciones falsas: el formulario conserva lo escrito y muestra un mensaje para reintentar.

## Pruebas de permisos

`supabase/tests/database/*.test.sql` crea fixtures dentro de transacciones pgTAP y termina con `ROLLBACK`; verifica publicación pública, acceso de administradores y no administradores, RPCs de moderación, transiciones, auditoría, privacidad de cuentas y límites de RLS. `npm run test:db` ejecuta únicamente esa carpeta; las migraciones y los directorios temporales ya no se descubren como tests pgTAP. El comando no aplica migraciones ni reinicia la base. Usalo con una base local aislada y limpia cuando haya datos persistentes: varias reglas, como la protección del último administrador, dependen de la tabla completa.

La base local persistente puede contener administradores/perfiles y funciones instaladas desde una versión anterior de las migraciones. Los tests se deben ejecutar sobre una instancia local descartable creada desde las migraciones actuales; no reinicies esa base persistente para obtener un resultado verde.

### Integración de imágenes profesionales

`npm run test:images:integration` ejecuta `supabase/tests/integration/professional-images.test.ts` con el servidor Next real, Auth, RPC y Storage de Supabase local. Antes de iniciarlo, levantá una pila temporal con `project_id` y puertos propios y exportá en esa misma terminal `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_TEST_WORKDIR` apuntando exclusivamente a la pila temporal. La clave de servicio se usa solo en el proceso del servidor Next y en el proceso de test para preparar usuarios/objetos; nunca se añade a código cliente ni a solicitudes del navegador. No imprimas la salida de `supabase status -o env`, porque incluye credenciales.

La suite cubre reserva y subida autenticadas, rechazo anónimo, rechazo de bytes inválidos, privacidad del temporal y de la ruta final antes de moderación, sanitización de metadatos, acceso administrativo, aprobación/publicación/ocultamiento, borrado mediante Storage y limpieza de una reserva sin objeto. Comprueba una denegación real cuando un usuario intenta borrar el temporal reservado por otra persona y verifica que la reserva y el objeto ajenos se conservan; luego su titular elimina el objeto mediante el handler real. También prepara el estado `cleanup_pending` permitido por la RPC mientras el objeto sigue presente y verifica que el reintento real del handler elimine objeto y reserva. La migración `202610260001_owner_storage_cleanup_visibility.sql` conserva lectura temporal exclusiva del titular durante la limpieza: Storage requiere que el objeto sea visible por `SELECT` para borrarlo; una vez que comienza el borrado, los visitantes dejan de verlo y el titular conserva acceso a sus rutas para que Storage pueda completar la operación. No simula un corte transitorio del servicio Storage durante el borrado del propio titular: ese fallo de transporte sigue pendiente de una estrategia de inyección de fallos confiable.

Ejecutá también pgTAP contra el mismo stack, indicándolo de forma explícita: `npm run test:db -- --local --workdir <directorio-temporal-del-proyecto>`. El runner de backfill sigue siendo independiente y se invoca con `powershell.exe -NoProfile -File .\supabase\tests\migrations\recover_legacy_image_uploads.ps1`. Detené únicamente la pila temporal al finalizar y verificá sus recursos mediante la etiqueta de su `project_id`; no reinicies ni limpies el stack local persistente.

### Migración de recuperación de cargas

La migración `202610250002_recover_legacy_image_uploads.sql` debe probarse como actualización: primero se crea una fila `uploading` con `upload_path IS NULL` usando el esquema posterior a `202610250001`, y luego se aplica el backfill. El test de esquema está en `supabase/tests/migrations/recover_legacy_image_uploads.ps1`.

Si se invoca desde Windows PowerShell 5.1, el runner busca un `pwsh` 7 instalado y se relanza con él antes de cualquier acceso a Docker. Busca primero en el PATH, las ubicaciones estándar de PowerShell 7 y el runtime local de Codex. Si no encuentra uno, se detiene sin tocar Docker.

El runner prueba el archivo real `202610250002_recover_legacy_image_uploads.sql` en un único contenedor PostgreSQL 17. No inicia Supabase CLI ni requiere Auth, Storage o pgTAP: crea una porción compatible del esquema anterior al backfill, ejecuta la migración y valida con aserciones SQL que la fila `uploading` sin `upload_path` se recupere, que una ruta existente no se sobrescriba y que una fila en otro estado no cambie. Las aserciones hacen terminar `psql` con error si el resultado difiere.

La imagen debe estar presente localmente: el runner usa `--pull=never` y no descarga imágenes. El contenedor usa `--network none`, no publica puertos y guarda `PGDATA` en `tmpfs`; el runner verifica ID, nombre, etiquetas, imagen y configuración, además del mount efectivo, antes de enviar SQL. El SQL temporal se escribe en el directorio temporal del sistema operativo, fuera de `supabase/tests`, para que Supabase CLI no lo descubra como pgTAP. En errores conserva diagnóstico e identidad y solo intenta limpiar el contenedor de esa ejecución si su etiqueta y nombre se confirman. No consulta ni modifica el grupo Supabase local, el volumen legado ni un proyecto remoto.

```powershell
powershell.exe -NoProfile -File .\supabase\tests\migrations\recover_legacy_image_uploads.ps1
```

Este runner valida únicamente la migración de recuperación en PostgreSQL real. No forma parte de `npm run test:db`; ejecutalo por separado cuando se necesite comprobar el backfill.

Para inspeccionar un volumen pendiente sin modificarlo, usá solo consultas de metadatos: `docker volume inspect --format '{{.Name}}|{{.CreatedAt}}|{{json .Labels}}' <nombre>` y `docker ps -a --filter 'volume=<nombre>' --format '{{.ID}}|{{.Names}}|{{.Status}}'`. La etiqueta `com.supabase.stack-managed=true` por sí sola no confirma pertenencia al proyecto descartable; no borres ni reasignes ese volumen por conjetura.

## Borrado de cuenta pendiente

La UI de eliminación definitiva de cuenta todavía no está implementada. Antes de habilitar cuentas en producción, agregar un flujo autenticado de reautenticación/confirmación y una operación de servidor segura que borre `auth.users` y los datos vinculados, además de un enlace externo para solicitar el borrado. No se expone una secret key para resolverlo desde el cliente.
