# Estrategia Android y iOS

## Decisión para esta etapa

A Mano conserva Next.js como producto web y servidor. La autenticación usa sesiones PKCE en cookies, un `proxy.ts` que verifica/renueva sesiones, páginas de servidor y Server Actions. Las rutas de perfil consultan datos dinámicos.

Capacitor puede alojar assets web generados con una carpeta `webDir`, pero la exportación estática de Next no admite cookies, Proxy, Server Actions ni rutas dinámicas sin pre-generar todos sus parámetros. Convertir esta app a `output: "export"` ahora rompería el flujo de cuenta que se acaba de preparar. Tampoco hay un host de producción, dominio propio, lista de enlaces de retorno móvil ni prueba en WebView. Por eso Capacitor no se instaló y no hay `capacitor.config`, proyectos nativos o identificadores falsos.

La ruta recomendada es mantener la web SSR y validar primero la experiencia. Para una app instalable, preparar una entrada móvil de Capacitor con bundle local y UI adaptada a WebView; mantener migraciones, RLS y reglas de negocio compartidas, y definir explícitamente cómo autenticar contra Supabase en móvil con deep links PKCE y almacenamiento de sesión apto para el dispositivo. Reutilizar la web servida desde un dominio remoto como pantalla principal no se toma como build de tienda ni se considera una experiencia móvil aprobada.

La moderación de A Mano también depende de rutas SSR y Server Actions que validan sesión y rol en servidor. No funciona al exportar Next.js a archivos estáticos ni al llamar esas acciones desde un `webDir` local de Capacitor. Para una aplicación nativa habría que implementar una interfaz móvil real y una capa HTTPS autenticada para sus operaciones, conservando los RPC/RLS como autoridad; el panel web actual puede seguir operando desde el sitio SSR. No se cambia la configuración de Next.js ni se afirma compatibilidad móvil nativa en esta fase.

Apple revisa que una app aporte utilidad y experiencia más allá de un sitio reempaquetado; una capa de WebView sin valor propio puede no superar su criterio de funcionalidad mínima ([App Review Guidelines, 4.2](https://developer.apple.com/app-store/review/guidelines/)). Capacitor sigue siendo una opción razonable para una interfaz móvil propia: usa WKWebView en iOS y permite sumar APIs nativas cuando haya una necesidad concreta ([documentación de Capacitor](https://capacitorjs.com/docs)).

## Requisitos para crear builds

1. Elegir un dominio propio y decidir el identificador de paquete/bundle (`ar.com.<dominio-propio>.amano` es solo un formato ilustrativo; todavía no está registrado ni disponible).
2. Implementar la entrada móvil y resolver navegación interna/externa, retorno desde correo, sesiones y errores sin depender de cookies o Server Actions de Next.
3. Configurar deep links de dominio verificado (Universal Links y Android App Links), callback seguro en Supabase y pruebas de registro, confirmación, recuperación, vencimiento de sesión y cierre de sesión en dispositivos reales.
4. Instalar Capacitor Core/CLI en el proyecto cuando exista un directorio real con `index.html` y assets compilados; establecer `webDir`, nombre `A Mano` e identificador elegido; después agregar y sincronizar plataformas siguiendo la [guía oficial de instalación](https://capacitorjs.com/docs/getting-started):

   ```bash
   npm install @capacitor/core
   npm install --save-dev @capacitor/cli
   npx cap init
   npm install @capacitor/android @capacitor/ios
   npx cap add android
   npx cap add ios
   npm run build
   npx cap sync
   ```

   Estos son pasos futuros: el `npm run build` actual produce un servidor Next y todavía no un `webDir` de Capacitor.
5. Crear icono y recursos de inicio en sus tamaños nativos, completar áreas seguras, permisos justificados, apertura de WhatsApp/enlaces y comportamiento atrás.
6. Probar la compilación nativa y la UX en tamaños chicos, tablets, lectores de pantalla, modos de teclado, conexión lenta y sin conexión.

La versión estable actual consultada de Capacitor es 8. Sus requisitos publicados incluyen Node.js 22+, Xcode 26+ y macOS para compilar iOS; Android requiere Android Studio 2025.2.1+ y SDK Android ([environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)). El Node actual de este entorno es 24.18; trabaja en Windows y no puede compilar iOS. Cuando haya proyecto Capacitor, el build iOS se completa en una Mac con Xcode, se selecciona el equipo de firma y Bundle ID, se archiva y se sube a App Store Connect para TestFlight y revisión.

## Antes de publicar

- Definir el ID final de Android y bundle ID de iOS en los paneles de las tiendas; revisar disponibilidad y propiedad del dominio.
- Crear icono, splash/lanzamiento, capturas reales, ficha, categoría, clasificación por edad, contacto de soporte y metadatos localizados.
- Publicar términos y privacidad con revisión legal y describir con precisión datos, Supabase, retención, uso de teléfono/WhatsApp, borrado y proveedores. Las páginas web actuales son borradores, no una declaración legal definitiva.
- Implementar y probar eliminación de cuenta y datos: Apple exige iniciar la eliminación dentro de la app cuando permite crear cuentas ([regla 5.1.1(v)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/)); Google Play requiere opción dentro de la app y recurso web externo para pedir el borrado ([política de Play](https://support.google.com/googleplay/android-developer/answer/13327111)).
- Revisar consentimiento de privacidad, Data Safety de Play, privacidad de App Store, dominios de autenticación de producción y enlace de eliminación externo.
- Firmar Android App Bundle con claves guardadas fuera del repositorio y cargar a una pista interna; firmar/archive iOS con certificado/perfil de distribución y enviar por App Store Connect/TestFlight.
- Probar instalaciones firmadas, universal/app links, notificaciones si se incorporan, enlaces WhatsApp, actualización y reingreso de sesión.
- Completar cuentas de desarrollador, certificados, revisión de las tiendas y políticas regionales.

No se generaron builds Android/iOS ni se prepararon certificados, cuentas, capturas o metadatos de tienda. La aprobación final depende de las pruebas y del proceso de revisión de Google/Apple.
