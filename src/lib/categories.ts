export const categories = [
  { slug: "hogar-construccion", name: "Hogar y construcción", icon: "home", detail: "Arreglos, instalaciones y mejoras" },
  { slug: "autos-motos", name: "Autos y motos", icon: "car", detail: "Mecánica, cuidado y movilidad" },
  { slug: "belleza-bienestar", name: "Belleza y bienestar", icon: "sparkles", detail: "Cuidado personal y bienestar" },
  { slug: "mascotas", name: "Mascotas", icon: "paw", detail: "Cuidado, paseo y compañía" },
  { slug: "educacion-clases", name: "Educación y clases", icon: "book", detail: "Apoyo escolar y aprendizaje" },
  { slug: "tecnologia", name: "Tecnología", icon: "laptop", detail: "Soporte, reparación y soluciones" },
  { slug: "profesionales-negocios", name: "Profesionales y negocios", icon: "briefcase", detail: "Asesoramiento y servicios expertos" },
  { slug: "fletes-mudanzas", name: "Fletes y mudanzas", icon: "truck", detail: "Traslados y ayuda para mudarte" },
  { slug: "eventos", name: "Eventos", icon: "confetti", detail: "Ideas y servicios para celebrar" },
  { slug: "otros-servicios", name: "Otros servicios", icon: "grid", detail: "Encontrá eso que estás buscando" },
] as const;

export type Category = (typeof categories)[number];

export function getCategory(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}
