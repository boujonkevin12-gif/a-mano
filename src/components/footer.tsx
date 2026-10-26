import Link from "next/link";
import { Brand } from "@/components/brand";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-main">
        <div className="footer-about"><Brand light /><p>Encontrá lo que necesitás.<br />Cerca tuyo.</p><span className="footer-location">Concepción del Uruguay, Entre Ríos</span></div>
        <div className="footer-column"><h2>Explorá</h2><Link href="/#categorias">Todas las categorías</Link><Link href="/buscar">Buscar servicios</Link><Link href="/publicar">Ofrecer mis servicios</Link></div>
        <div className="footer-column"><h2>Información</h2><Link href="/terminos">Términos y condiciones</Link><Link href="/privacidad">Privacidad</Link><Link href="/contacto">Contacto</Link></div>
      </div>
      <div className="wrap footer-bottom"><span>© {new Date().getFullYear()} A Mano</span><span>Una forma más cercana de encontrar ayuda.</span></div>
    </footer>
  );
}
