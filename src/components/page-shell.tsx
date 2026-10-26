import Link from "next/link";
import { Icon } from "@/components/icon";

export function PageShell({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <main className="info-main wrap">
      <div className="info-card">
        <span className="eyebrow"><span className="eyebrow-dot" />{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="info-note"><span className="note-icon"><Icon name="shield" size={20} /></span><span>Esta función todavía está en preparación. A Mano no va a confirmar acciones hasta que el servicio esté disponible.</span></div>
        <Link className="text-link" href="/"><span>Volver al inicio</span><Icon name="arrow" size={18} /></Link>
      </div>
    </main>
  );
}
