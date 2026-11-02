/* Genera ../base/Alpine.html: Alpine.js incrustado en la página (sin CDN), como Estilos.html.
   La versión es la de package.json (alpinejs, MIT).

   Alpine se arranca solo en cuanto se carga (queueMicrotask(() => Alpine.start())). Aquí se
   quita ese arranque: Index.html lo incluye antes que las pantallas, y cada una registra sus
   stores y componentes (Alpine.store, Alpine.data) mientras se carga. base/Arranque.html llama a
   Alpine.start() al final, cuando ya están todos.

     npm run construir   (genera también Estilos.html)
     npm run alpine      (solo este archivo) */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const version = require("alpinejs/package.json").version;
const codigo = fs.readFileSync(require.resolve("alpinejs/dist/cdn.min.js"), "utf8");

/* El arranque automático es la última sentencia del paquete: window.Alpine=X;queueMicrotask(()=>{X.start()}). */
const ARRANQUE = /queueMicrotask\(\(\)=>\{(\w+)\.start\(\)\}\);?/g;
const arranques = codigo.match(ARRANQUE) || [];
if (arranques.length !== 1) throw new Error("No se encontró el arranque automático de Alpine " + version + " (" + arranques.length + "): revisa ARRANQUE en alpine.mjs.");
const sinArranque = codigo.replace(ARRANQUE, "");
if (/<\/script|<\?/i.test(sinArranque)) throw new Error("El código de Alpine contiene «</script» o «<?»: no se puede incrustar tal cual.");

const html = "<script>\n/*! Alpine.js " + version + " · MIT · https://alpinejs.dev · generado por estilos/alpine.mjs: no editar a mano.\n" +
  "    Sin arranque automático: base/Arranque.html llama a Alpine.start(). */\n" + sinArranque.trim() + "\n</script>\n";
fs.writeFileSync(path.join(AQUI, "..", "base", "Alpine.html"), html);
console.log("Alpine.html: Alpine.js " + version + ", " + Math.round(html.length / 1024) + " KB");
