import type { Metadata } from "next";
import Link from "next/link";
import { StorageImage } from "@/components/storage-image";
import { notFound } from "next/navigation";
import { categories } from "@/lib/categories";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { PublicProfessional } from "@/lib/supabase/database.types";
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
  const phone = whatsappDigits(professional.whatsapp_phone);
  const categoryNames = categories.filter((category) => professional.category_slugs.includes(category.slug)).map((category) => category.name);
  return <main className="account-main"><div className="account-wrap"><div className="account-heading"><span className="eyebrow">PROFESIONAL EN {professional.city.toLocaleUpperCase("es-AR")}</span><h1>{professional.business_name}</h1><p>{professional.service_area}</p></div><article className="professional-result profile-detail"><p>{professional.description}</p><div className="professional-result-categories" aria-label="Categorías">{categoryNames.map((name) => <span key={name}>{name}</span>)}</div>{phone && <a className="button" href={`https://wa.me/${phone}?text=${encodeURIComponent("Hola, vi tu perfil en A Mano y quisiera consultar por tus servicios.")}`} target="_blank" rel="noopener noreferrer">Contactar por WhatsApp</a>}<span className="field-help">Consultá los detalles y acordá directamente con cada profesional. A Mano no ofrece una verificación de identidad.</span></article>{(images ?? []).length > 0 && <section className="public-photo-gallery" aria-label="Fotos de trabajos"><h2>Fotos de trabajos</h2><div>{images?.map((image) => <StorageImage key={image.id} path={image.object_path} width={image.width} height={image.height} alt={image.image_kind === "profile" ? `Foto de ${professional.business_name}` : `Trabajo de ${professional.business_name}`} />)}</div></section>}<div className="account-nav"><Link href="/buscar">Volver a los resultados</Link></div></div></main>;
}
