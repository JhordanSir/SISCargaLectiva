/* Genera ../comun/Estilos.html: Tailwind CSS compilado a partir de entrada.css (que lee las clases de
   los .html de la interfaz) e incrustado en la página, sin CDN, junto con los logotipos de marca/.
   Ejecútalo con «npm run construir» cada vez que cambie la interfaz. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(AQUI, "node_modules", "@tailwindcss", "cli", "dist", "index.mjs");
const VERSION = JSON.parse(fs.readFileSync(path.join(AQUI, "node_modules", "tailwindcss", "package.json"), "utf8")).version;
if (!fs.existsSync(CLI)) throw new Error("Falta el CLI de Tailwind: ejecuta «npm install» en AppScript/estilos.");

const temporal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sis-estilos-")), "salida.css");
execFileSync(process.execPath, [CLI, "-i", path.join(AQUI, "entrada.css"), "-o", temporal, "--minify"], { cwd: AQUI, stdio: "inherit" });
const css = fs.readFileSync(temporal, "utf8").trim();

const png = nombre => "url(data:image/png;base64," + fs.readFileSync(path.join(AQUI, "marca", nombre)).toString("base64") + ")";

/* Los íconos de las notas y de los avisos van como máscara CSS: así el texto del elemento no cambia. */
const sprite = fs.readFileSync(path.join(AQUI, "..", "comun", "Iconos.html"), "utf8");
const mascara = id => {
  const m = sprite.match(new RegExp('<symbol id="i-' + id + '" viewBox="([^"]+)">([\\s\\S]*?)</symbol>'));
  if (!m) throw new Error("Iconos.html no tiene el ícono «" + id + "»: ejecuta «npm run iconos».");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + m[1] + '">' + m[2] + "</svg>";
  return "url(data:image/svg+xml;base64," + Buffer.from(svg).toString("base64") + ")";
};

const marcas = ":root{" +
  "--logo-lasalle:" + png("lasalle.png") + ";" +
  "--logo-wayrasimi:" + png("wayrasimi.png") + ";" +
  "--marca-wayrasimi:" + png("wayrasimi-marca.png") + ";" +
  "--ico-info:" + mascara("info") + ";" +
  "--ico-aviso:" + mascara("warning") + ";" +
  "--ico-ok:" + mascara("check-circle") + ";" +
  "--ico-error:" + mascara("x-circle") + ";" +
  "--ico-pestanas:" + mascara("browsers") + "}";

const html = `<!-- Generado por AppScript/estilos/construir.mjs con Tailwind CSS ${VERSION} a partir de estilos/entrada.css. No lo edites a mano. -->\n` +
  "<style>\n" + css + "\n" + marcas + "\n</style>\n";
if (html.includes("<?")) throw new Error("El CSS contiene «<?», que HtmlService tomaría por un scriptlet.");
if ((html.match(/<\/style>/g) || []).length !== 1) throw new Error("El CSS no puede contener «</style>».");
fs.writeFileSync(path.join(AQUI, "..", "comun", "Estilos.html"), html);
console.log("Estilos.html: " + Math.round(html.length / 1024) + " KB (CSS " + Math.round(css.length / 1024) + " KB)");
