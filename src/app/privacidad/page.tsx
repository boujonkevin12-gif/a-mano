import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacidad · borrador" };

export default function PrivacyPage() {
  return <main className="legal-main wrap"><div className="legal-heading"><span className="eyebrow">A MANO · INFORMACIÓN</span><h1>Privacidad</h1><p className="legal-warning">BORRADOR DE TRABAJO · REQUIERE REVISIÓN LEGAL ANTES DE PUBLICARSE</p><p>Esta página describe el modelo de datos previsto. Hay que completar responsable, contacto, plazos, base legal, derechos aplicables y proveedores contratados antes de habilitar cuentas reales.</p></div>
    <article className="legal-content">
      <section><h2>Qué datos contempla el servicio</h2><p>La versión actual está preparada para usar correo electrónico de acceso, nombre visible, ciudad y un teléfono opcional en la cuenta. Quienes ofrezcan servicios también pueden ingresar nombre comercial, descripción, categorías, ciudad, zona de atención y WhatsApp opcional. El teléfono profesional podría mostrarse a cualquier visitante si el perfil se aprueba, se publica y la persona lo incluye.</p><p>El formulario todavía no sube imágenes. Las búsquedas y contactos se harán directamente entre las personas usuarias; A Mano no incluye chat interno en esta etapa.</p></section>
      <section><h2>Cuándo se recopilan</h2><p>La web solo envía cuentas y formularios a un proyecto de Supabase cuando el operador configura sus credenciales. Si no hay conexión configurada, los formularios explican que no pueden completarse. Antes de activar el servicio públicamente hay que confirmar este borrador con el funcionamiento de producción.</p></section>
      <section><h2>Proveedores y transferencias</h2><p>La arquitectura usa Supabase para autenticación y base de datos. Antes del lanzamiento, especificar la entidad contratada, ubicación de datos, subencargados, transferencias internacionales y medidas vigentes de cada proveedor. Si se agrega otro proveedor, describirlo aquí antes de recopilar datos con esa integración.</p></section>
      <section><h2>Visibilidad y seguridad</h2><p>Los datos básicos de la cuenta son privados para su titular. Solo los datos de un perfil profesional aprobado y publicado se exponen públicamente. El WhatsApp profesional es opcional y, si se ingresa, se presenta como medio de contacto público. A Mano no afirma que los profesionales estén verificados.</p><p>La base aplica políticas de acceso y limita la información pública. Esa configuración técnica no sustituye medidas organizativas, revisión periódica, atención de incidentes ni las obligaciones legales aplicables.</p></section>
      <section><h2>Conservación, acceso y borrado</h2><p>Definir plazos de conservación, respaldos y el procedimiento para acceder, rectificar, actualizar o borrar información. La eliminación de cuenta todavía no está implementada; completarla antes de ofrecer el registro a usuarios reales y antes de publicar en tiendas.</p></section>
      <section><h2>Contacto y vigencia</h2><p>Agregar razón social o persona responsable, domicilio y un canal de contacto efectivo para consultas de privacidad. Fecha y versión: pendientes.</p></section>
    </article>
  </main>;
}
