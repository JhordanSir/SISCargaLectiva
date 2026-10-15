/* Genera ../Iconos.html: un sprite <symbol> con los íconos Phosphor (2.1.1, MIT, peso regular)
   que usa la interfaz. Se usan con <svg class="ico"><use href="#i-nombre"></use></svg>.
   Para añadir un ícono, súmalo a ICONOS y ejecuta «npm run iconos» (necesita internet). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const VERSION = "2.1.1";

const ICONOS = [
  "house", "clipboard-text", "chalkboard-teacher", "chart-bar", "arrow-left", "arrow-right",
  "arrows-clockwise", "pencil-simple", "eye", "clipboard", "upload-simple", "download-simple",
  "check-circle", "check", "warning", "x-circle", "info", "lock-simple", "timer", "plus",
  "plus-circle", "git-merge", "arrows-split", "arrows-merge", "link-break", "trash",
  "clock-counter-clockwise", "floppy-disk", "seal-check", "arrows-in-line-vertical",
  "arrows-out-line-vertical", "caret-down", "swap", "user-switch", "users-three", "buildings",
  "graduation-cap", "books", "stack", "clock", "chart-pie-slice", "globe", "sign-out", "x",
  "funnel", "calendar-blank", "confetti", "sparkle", "user-plus", "browsers", "list-checks",
  "table", "hourglass-medium", "file-xls", "user-circle", "shield-warning"
];

const simbolos = [];
for (const nombre of ICONOS) {
  const url = `https://cdn.jsdelivr.net/npm/@phosphor-icons/core@${VERSION}/assets/regular/${nombre}.svg`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " → " + r.status);
  const svg = await r.text();
  const caja = (svg.match(/viewBox="([^"]+)"/) || [])[1] || "0 0 256 256";
  const interior = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<rect width="256" height="256" fill="none"\s*\/>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  simbolos.push(`<symbol id="i-${nombre}" viewBox="${caja}">${interior}</symbol>`);
}

const html = `<!-- Generado por AppScript/estilos/iconos.mjs: íconos Phosphor ${VERSION} (MIT), peso regular. No lo edites a mano. -->\n` +
  '<svg class="sprite" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + simbolos.join("") + "</svg>\n";
if (html.includes("<?")) throw new Error("El sprite contiene «<?», que HtmlService tomaría por un scriptlet.");
fs.writeFileSync(path.join(AQUI, "..", "Iconos.html"), html);
console.log(ICONOS.length + " íconos → Iconos.html (" + html.length + " caracteres)");
