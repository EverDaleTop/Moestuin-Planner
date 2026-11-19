export type LegalPageKind = "privacy" | "voorwaarden" | "cookies";

export function legalPageFromPath(pathname: string): LegalPageKind | null {
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  if (path === "/privacy" || path === "/privacybeleid") return "privacy";
  if (path === "/voorwaarden" || path === "/algemene-voorwaarden") return "voorwaarden";
  if (path === "/cookies" || path === "/cookieverklaring") return "cookies";
  return null;
}
