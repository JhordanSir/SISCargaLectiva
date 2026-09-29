/* Utilidades para probar el código de Apps Script en node, sin Google. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = path.resolve(RAIZ, "..");
export const XLSX_CARRERA = path.join(REPO, "docs/archivos/SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx");
export const XLSX_DEPARTAMENTO = path.join(REPO, "docs/archivos/SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx");

/* Lector zip mínimo: directorio central + inflate. Devuelve {ruta: Buffer}. */
export function descomprimir(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("El archivo no es un zip.");
  const total = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const partes = {};
  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error("Directorio central dañado.");
    const metodo = buffer.readUInt16LE(p + 10);
    const tamano = buffer.readUInt32LE(p + 20);
    const lNombre = buffer.readUInt16LE(p + 28), lExtra = buffer.readUInt16LE(p + 30), lComent = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const nombre = buffer.toString("utf8", p + 46, p + 46 + lNombre);
    const inicio = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const datos = buffer.subarray(inicio, inicio + tamano);
    partes[nombre] = metodo === 0 ? Buffer.from(datos) : zlib.inflateRawSync(datos);
    p += 46 + lNombre + lExtra + lComent;
  }
  return partes;
}

/* Partes XML de un .xlsx, como las entrega descomprimirXlsx_() en Apps Script. */
export function partesXlsx(ruta) {
  const partes = descomprimir(fs.readFileSync(ruta));
  const xml = {};
  for (const [nombre, buf] of Object.entries(partes)) {
    if (/\.(xml|rels)$/i.test(nombre)) xml[nombre] = buf.toString("utf8");
  }
  return xml;
}

/* Ejecuta archivos de AppScript/ en un contexto aislado, como hace Apps Script
   (todos comparten el ámbito global). */
export function cargar(archivos, globales = {}) {
  const ctx = vm.createContext(Object.assign({ console }, globales));
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx, { filename: f });
  return ctx;
}

/* Los objetos creados dentro del contexto tienen otros prototipos: se pasan por JSON
   antes de compararlos con assert. */
export const plano = x => JSON.parse(JSON.stringify(x));

/* Oferta de datos-ejemplo.js, la que el prototipo extrajo a mano de los mismos Excel. */
export function ofertaPatron() {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(REPO, "docs/prototipo/funcional/datos-ejemplo.js"), "utf8"), { window });
  return plano(window.SISDATOS.oferta);
}
