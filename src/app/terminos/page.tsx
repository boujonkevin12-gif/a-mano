import type { Metadata } from "next";

export const metadata: Metadata = { title: "Términos · borrador" };

export default function TermsPage() {
  return <main className="legal-main wrap"><div className="legal-heading"><span className="eyebrow">A MANO · INFORMACIÓN</span><h1>Términos y condiciones</h1><p className="legal-warning">BORRADOR DE TRABAJO · NO ES UN TEXTO LEGAL VIGENTE</p><p>Este esquema describe la experiencia que se está construyendo. La identidad de quien presta el servicio, las reglas de publicación, la responsabilidad, la jurisdicción y el texto definitivo requieren revisión legal antes de abrir el registro.</p></div>
    <article className="legal-content">
      <section><h2>Qué ofrece A Mano</h2><p>A Mano está diseñado para ayudar a encontrar y ofrecer servicios locales. Las personas podrán consultar perfiles publicados y contactarse directamente. Las condiciones del trabajo y cualquier pago se acuerdan entre las partes, fuera de A Mano.</p></section>
      <section><h2>Perfiles y publicaciones</h2><p>Las personas que ofrecen servicios pueden completar un perfil con actividad, descripción, categorías, zona de atención y un canal opcional de WhatsApp. Un perfil nuevo queda pendiente y no aparece hasta contar con aprobación y publicación administrativa. Editar un perfil publicado lo oculta hasta una nueva revisión.</p><p>La revisión de una publicación no equivale a verificar identidad, matrícula, antecedentes, calidad, disponibilidad ni idoneidad profesional.</p></section>
      <section><h2>Relación entre las partes</h2><p>A Mano no negocia ni garantiza los servicios publicados. Antes de contratar, las personas deben conversar sobre alcance, precio, tiempos, materiales, seguridad y cualquier condición relevante. Definir con asesoramiento legal los límites de responsabilidad y el mecanismo de reclamos aplicable.</p></section>
      <section><h2>Uso del sitio</h2><p>Completar con reglas de uso, contenido permitido, publicaciones denunciadas, suspensión y proceso de apelación. La plataforma todavía no publica contenido de profesionales ni recibe denuncias.</p></section>
      <section><h2>Datos, cambios y contacto</h2><p>Vincular la política de privacidad definitiva, indicar la persona responsable, domicilio, canal de contacto, fecha de vigencia y jurisdicción aplicable. No publicar este borrador como condiciones contractuales finales.</p></section>
    </article>
  </main>;
}
