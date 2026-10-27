/** Returns the digits required by wa.me only for plausible international numbers. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const hasPlusPrefix = trimmed.startsWith("+");
  const hasInternationalDialPrefix = trimmed.startsWith("00");
  if (!hasPlusPrefix && !hasInternationalDialPrefix) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (hasInternationalDialPrefix) digits = digits.slice(2);
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export type ArgentinaPhoneKind = "mobile" | "landline";

/** Builds the international Argentine number from the national area + subscriber digits. */
export function normalizeArgentinaWhatsapp(value: string, kind: ArgentinaPhoneKind): string | null {
  if (!/^[\d\s().-]*$/.test(value)) return null;
  const national = value.replace(/\D/g, "");
  if (!/^\d{10}$/.test(national) || national.startsWith("0")) return null;
  return kind === "mobile" ? `+549${national}` : `+54${national}`;
}

export function parseArgentinaWhatsapp(phone: string | null | undefined): {
  nationalNumber: string;
  kind: ArgentinaPhoneKind;
  unsupported: boolean;
} {
  if (!phone) return { nationalNumber: "", kind: "mobile", unsupported: false };
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^549\d{10}$/.test(digits)) return { nationalNumber: digits.slice(3), kind: "mobile", unsupported: false };
  if (/^54\d{10}$/.test(digits)) return { nationalNumber: digits.slice(2), kind: "landline", unsupported: false };
  return { nationalNumber: "", kind: "mobile", unsupported: true };
}
