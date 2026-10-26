import Link from "next/link";
import { categories } from "@/lib/categories";
import type { PublicProfessional } from "@/lib/supabase/database.types";
import { whatsappDigits } from "@/lib/whatsapp";

const categoryNames = new Map<string, string>(categories.map((category) => [category.slug, category.name]));

export function ProfessionalCard({ professional }: { professional: PublicProfessional }) {
  const phone = whatsappDigits(professional.whatsapp_phone);
  return <article className="professional-result">
    <h2><Link href={`/profesional/${professional.slug}`}>{professional.business_name}</Link></h2>
    <p>{professional.description}</p>
    <div className="professional-result-meta"><span>{professional.city}</span><span>Zona: {professional.service_area}</span></div>
    <div className="professional-result-categories" aria-label="Categorías">{professional.category_slugs.map((slug) => <span key={slug}>{categoryNames.get(slug) ?? slug}</span>)}</div>
    <div className="result-actions"><Link className="text-link" href={`/profesional/${professional.slug}`}>Ver perfil</Link>{phone && <a className="button" href={`https://wa.me/${phone}?text=${encodeURIComponent("Hola, vi tu perfil en A Mano y quisiera consultar por tus servicios.")}`} target="_blank" rel="noopener noreferrer">Contactar por WhatsApp</a>}</div>
  </article>;
}
