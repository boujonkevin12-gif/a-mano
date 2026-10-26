import Link from "next/link";
import { Brand } from "@/components/brand";
import { signOutAction } from "@/app/actions/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function Header() {
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      if (supabase) {
        const { data: { user }, error } = await supabase.auth.getUser();
        signedIn = Boolean(user) && !error;
      }
    } catch {
      signedIn = false;
    }
  }

  return (
    <header className="site-header">
      <div className="header-inner wrap">
        <Brand />
        <nav className="desktop-nav" aria-label="Navegación principal">
          <Link href="/#categorias">Categorías</Link>
          <Link href="/#como-funciona">Cómo funciona</Link>
        </nav>
        <div className="header-actions">
          <Link className="header-explore" href="/#categorias">Explorar servicios</Link>
          {signedIn ? <><Link className="header-explore" href="/cuenta">Mi cuenta</Link><form action={signOutAction}><button className="button button-small" type="submit">Cerrar sesión</button></form></> : <><Link className="header-explore" href="/ingresar">Iniciar sesión</Link><Link className="button button-small" href="/publicar">Ofrecer mis servicios</Link></>}
        </div>
        <details className="mobile-nav">
          <summary aria-label="Abrir menú"><span className="menu-lines" /></summary>
          <nav aria-label="Navegación móvil">
            <Link href="/#categorias">Categorías</Link>
            <Link href="/#como-funciona">Cómo funciona</Link>
            {signedIn ? <><Link href="/cuenta">Mi cuenta</Link><form action={signOutAction}><button type="submit">Cerrar sesión</button></form></> : <><Link href="/ingresar">Iniciar sesión</Link><Link href="/registrarse">Crear cuenta</Link><Link href="/publicar">Ofrecer mis servicios</Link></>}
          </nav>
        </details>
      </div>
    </header>
  );
}
