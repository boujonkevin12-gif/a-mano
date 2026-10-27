import type { Metadata } from "next";
import Link from "next/link";
import { StorageImage } from "@/components/storage-image";
import { Icon } from "@/components/icon";
import { notFound } from "next/navigation";
import { categories } from "@/lib/categories";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { PublicProfessional } from "@/lib/supabase/database.types";
import { professionalInitials } from "@/lib/professional-profile";
import { whatsappDigits } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Perfil profesional" };

export default async function ProfessionalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return <main className="account-main"><div className="account-wrap"><div className="empty-results"><h1>El perfil necesita conexión.</h1><p>Configurá Supabase para consultar perfiles públicos.</p></div></div></main>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();
  const { data, error } = await supabase.rpc("get_public_professional", { p_slug: slug });
  if (error || !data?.length) notFound();

  const professional = data[0] as PublicProfessional;
  const { data: images } = await supabase.rpc("get_public_professional_images", { p_slug: slug });
  const profilePhoto = images?.find((image) => image.image_kind === "profile");
  const portfolioPhotos = (images ?? []).filter((image) => image.image_kind === "portfolio");
  const phone = whatsappDigits(professional.whatsapp_phone);
  const categoryNames = categories.filter((category) => professional.category_slugs.includes(category.slug)).map((category) => category.name);
  const initials = professionalInitials(professional.business_name);
  const whatsappMessage = "Hola, te contacto desde A Mano por tus servicios.";

  return <main className="account-main public-professional-main">
    <div className="account-wrap public-professional-wrap">
      <article className="public-professional-card" aria-labelledby="public-professional-name">
        <header className="public-professional-header">
          <div className="public-professional-avatar">
            {profilePhoto?.object_path
              ? <StorageImage className="public-professional-avatar-image" path={profilePhoto.object_path} width={160} height={160} alt={`Foto de perfil de ${professional.business_name}`} fallback={<span className="public-professional-initials">{initials}</span>} />
              : <span className="public-professional-avatar-fallback" role="img" aria-label={`Iniciales de ${professional.business_name}`}>{initials}</span>}
          </div>
          <div className="public-professional-identity">
            <span className="eyebrow">SERVICIO LOCAL</span>
            <h1 id="public-professional-name">{professional.business_name}</h1>
            <p className="public-professional-location"><Icon name="pin" size={17} />{professional.city}</p>
            <p className="public-professional-area">Zona de atención: {professional.service_area}</p>
            {categoryNames.length > 0 && <ul className="public-professional-categories" aria-label="Categorías">
              {categoryNames.map((name) => <li key={name}>{name}</li>)}
            </ul>}
            {phone && <a className="button public-professional-contact" href={`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}`} target="_blank" rel="noopener noreferrer" aria-label={`Contactar a ${professional.business_name} por WhatsApp al +${phone}`}>
              <span>Contactar por WhatsApp</span><span className="public-professional-phone">+{phone}</span>
            </a>}
          </div>
        </header>
        <section className="public-professional-about" aria-labelledby="public-professional-about-title">
          <h2 id="public-professional-about-title">Sobre el servicio</h2>
          <p>{professional.description}</p>
        </section>
        <p className="public-professional-note">Consultá los detalles y acordá directamente con cada profesional. A Mano no ofrece una verificación de identidad.</p>
      </article>

      {portfolioPhotos.length > 0 && <section className="public-photo-gallery public-professional-gallery" aria-labelledby="professional-work-title">
        <h2 id="professional-work-title">Fotos de trabajos</h2>
        <div>{portfolioPhotos.map((image) => <StorageImage key={image.id} path={image.object_path} width={image.width} height={image.height} alt={`Trabajo de ${professional.business_name}`} />)}</div>
      </section>}
      <div className="account-nav public-professional-back"><Link href="/buscar">Volver a los resultados</Link></div>
    </div>
  </main>;
}
