export function professionalInitials(businessName: string): string {
  const words = businessName.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = words.map((word) => Array.from(word)[0] ?? "").join("");
  return initials.toLocaleUpperCase("es-AR") || "AM";
}
