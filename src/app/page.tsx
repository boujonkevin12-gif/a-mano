import Link from "next/link";
import { Icon } from "@/components/icon";
import { ProfessionalCard } from "@/components/professional-card";
import { categories } from "@/lib/categories";
import { searchProfessionals } from "@/lib/supabase/public-data";

export default async function Home() {
  const highlights = await searchProfessionals({ city: "Concepción del Uruguay" });
  const professionals = highlights.configured && !highlights.error ? highlights.professionals.slice(0, 3) : [];
  return (
    <main>
      <section className="hero-section">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow"><span className="eyebrow-dot" />TU CIUDAD, TODO MÁS CERCA</span>
            <h1>Encontrá lo que necesitás.<br /><span>Cerca tuyo.</span></h1>
            <p className="hero-description">Descubrí profesionales y servicios en Concepción del Uruguay. Conocé sus trabajos y contactalos directamente.</p>
            <form action="/buscar" method="get" className="search-panel">
              <label className="search-field"><Icon name="search" size={21} /><span className="sr-only">¿Qué servicio estás buscando?</span><input name="q" type="search" placeholder="¿Qué servicio estás buscando?" /></label>
              <span className="search-divider" aria-hidden="true" />
              <label className="location-field"><Icon name="pin" size={20} /><span className="sr-only">Ciudad</span><input name="ciudad" type="search" autoComplete="address-level2" maxLength={100} placeholder="Ciudad" defaultValue="Concepción del Uruguay" /></label>
              <button className="button search-button" type="submit">Buscar servicios<Icon name="arrow" size={18} /></button>
            </form>
            <div className="hero-publish"><span>¿Trabajás por tu cuenta?</span><Link href="/publicar">Sumate a A Mano <Icon name="arrow" size={15} /></Link></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-sun" />
            <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
            <div className="art-board">
              <div className="board-top"><span className="board-logo">a.</span><span className="board-location"><Icon name="pin" size={13} />C. del Uruguay</span></div>
              <div className="board-title">Lo que buscás,<br /><strong>está acá cerca.</strong></div>
              <div className="board-chips"><span>Hogar</span><span>Clases</span><span>Bienestar</span></div>
              <div className="board-bottom"><span className="board-line" /><span>Hecho entre vecinos</span><span className="board-arrow"><Icon name="arrow" size={16} /></span></div>
            </div>
            <div className="art-sticker sticker-top"><span className="sticker-icon"><Icon name="sparkles" size={19} /></span><span>Un buen dato<br /><strong>hace la diferencia</strong></span></div>
            <div className="art-sticker sticker-bottom"><span className="sticker-pin"><Icon name="pin" size={17} /></span><span>Concepción del Uruguay<br /><strong>Entre Ríos</strong></span></div>
            <div className="art-leaf leaf-one" /><div className="art-leaf leaf-two" />
          </div>
        </div>
        <div className="hero-ribbon"><span>UN LUGAR PARA ENCONTRAR</span><i /><span>UN LUGAR PARA OFRECER</span><i /><span>UN LUGAR PARA CONECTAR</span><i /></div>
      </section>

      <section className="categories-section section-pad" id="categorias">
        <div className="wrap">
          <div className="section-heading"><div><span className="eyebrow">PARA CADA DÍA, PARA CADA PROYECTO</span><h2>¿Qué necesitás resolver?</h2></div><p>Explorá por categoría y encontrá<br className="desktop-break" /> el servicio que tenés en mente.</p></div>
          <div className="category-grid">
            {categories.map((category) => <Link className="category-card" href={`/categoria/${category.slug}`} key={category.slug}>
              <span className={`category-icon icon-${category.icon}`}><Icon name={category.icon} size={23} /></span>
              <span className="category-text"><strong>{category.name}</strong><small>{category.detail}</small></span>
              <span className="category-arrow"><Icon name="arrow" size={17} /></span>
            </Link>)}
          </div>
          <div className="category-footnote"><span className="footnote-mark">✳</span><span>¿No sabés dónde buscar? Probá con una palabra clave arriba.</span><Link href="/buscar">Ir al buscador <Icon name="arrow" size={15} /></Link></div>
        </div>
      </section>

      <section className="professionals-section section-pad" id="como-funciona">
        <div className="wrap professionals-layout">
          <div className="professionals-copy"><span className="eyebrow"><span className="eyebrow-dot" />PRONTO EN TU CIUDAD</span><h2>Los buenos trabajos<br />se hacen <em>con confianza.</em></h2><p>Conocé los servicios y trabajos que cada profesional comparte. Así podés tener más información antes de iniciar una conversación.</p><div className="trust-points"><div><span className="trust-check">✓</span><span>Conocé lo que ofrece cada profesional</span></div><div><span className="trust-check">✓</span><span>Mirá sus trabajos publicados</span></div><div><span className="trust-check">✓</span><span>Contactalo directamente por WhatsApp</span></div></div><p className="trust-caption">A Mano no verifica profesionales. Consultá los detalles y acordá directamente con cada persona.</p></div>
          {professionals.length ? <div className="home-professional-list">{professionals.map((professional) => <ProfessionalCard key={professional.id} professional={professional} />)}<Link href="/buscar" className="text-link home-results-link">Ver todos los profesionales <Icon name="arrow" size={17} /></Link></div> : <div className="empty-professionals"><div className="empty-illustration"><div className="empty-ring ring-a"/><div className="empty-ring ring-b"/><div className="empty-spark">✳</div><span className="empty-home"><Icon name="home" size={39} /></span><span className="empty-plus">+</span></div><span className="empty-tag">UN ESPACIO QUE SE LLENA CON VOS</span><h3>{highlights.configured && highlights.error ? "No pudimos cargar los perfiles." : "Este lugar es para los profesionales de acá."}</h3><p>{highlights.configured && highlights.error ? "Probá de nuevo en unos minutos." : "Cuando haya perfiles aprobados para publicar, van a aparecer acá."}</p><Link href="/publicar" className="text-link">¿Sos profesional? Sumate <Icon name="arrow" size={17} /></Link></div>}
        </div>
      </section>

      <section className="join-section">
        <div className="wrap join-card"><div className="join-graphic" aria-hidden="true"><div className="join-circle circle-one"/><div className="join-circle circle-two"/><span className="join-hand">✳</span><span className="join-mini">A.</span></div><div className="join-copy"><span className="eyebrow">TU TRABAJO MERECE SER ENCONTRADO</span><h2>¿Trabajás por tu cuenta?</h2><p>Sumate gratis a A Mano, mostrá lo que hacés y facilitá que más personas encuentren tus servicios.</p></div><Link href="/publicar" className="button join-button">Publicar mis servicios <Icon name="arrow" size={18} /></Link></div>
      </section>
    </main>
  );
}
