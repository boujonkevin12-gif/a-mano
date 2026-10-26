/** Returns the digits required by wa.me only for plausible international numbers. */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}
