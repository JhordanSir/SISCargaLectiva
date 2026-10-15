/* Recorrido E2E específico para CU-002: Carga y Gestión de Docentes.
   Controla Chrome headless mediante el protocolo DevTools (CDP). */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iniciarServidorLocal } from "./servidor-local.mjs";

const USUARIO = "mfloresl@ulasalle.edu.pe";
const PUERTO_CDP = 9334;
const dormir = ms => new Promise(r => setTimeout(r, ms));

let comprobaciones = 0;
function asegurar(cond, msg) {
  if (!cond) throw new Error("Falló comprobación: " + msg);
  comprobaciones++;
  console.log("  ✔ " + msg);
}

async function lanzarChrome() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "sis-chrome-cu002-"));
  const proceso = spawn(process.env.CHROME || "google-chrome-stable", [
    "--headless=new", "--remote-debugging-port=" + PUERTO_CDP, "--user-data-dir=" + perfil,
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank"
  ], { stdio: "ignore" });
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).ok) return { proceso, perfil }; } catch {}
    await dormir(200);
  }
  throw new Error("Chrome no arrancó");
}

class Pestana {
  static async abrir(url) {
    const t = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/new?about:blank`, { method: "PUT" })).json();
    const p = new Pestana();
    await p.conectar(t.webSocketDebuggerUrl);
    await p.enviar("Page.enable");
    await p.enviar("Runtime.enable");
    await p.enviar("DOM.enable");
    await p.enviar("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await p.ir(url);
    return p;
  }
  conectar(ws) {
    this.id = 0; this.pendientes = new Map(); this.errores = []; this.cargada = null;
    this.ws = new WebSocket(ws);
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pendientes.has(m.id)) {
        const { ok, mal } = this.pendientes.get(m.id);
        this.pendientes.delete(m.id);
        m.error ? mal(new Error(m.error.message)) : ok(m.result);
      } else if (m.method === "Runtime.exceptionThrown") {
        this.errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        this.errores.push(m.params.args.map(a => a.value ?? a.description).join(" "));
      } else if (m.method === "Page.loadEventFired" && this.cargada) {
        this.cargada();
      }
    };
    return new Promise(r => { this.ws.onopen = r; });
  }
  enviar(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, mal) => this.pendientes.set(id, { ok, mal }));
  }
  async ir(url) {
    const cargada = new Promise(r => { this.cargada = r; });
    await this.enviar("Page.navigate", { url });
    await cargada;
  }
  async evaluar(expr) {
    const r = await this.enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("Error al evaluar «" + expr.slice(0, 80) + "»: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async esperar(expr, msg, ms = 10000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (await this.evaluar(expr)) return asegurar(true, msg);
      await dormir(100);
    }
    throw new Error("Tiempo agotado esperando: " + msg + " (" + expr + ")");
  }
  async pulsar(sel, msg) {
    await this.esperar(`!!document.querySelector(${JSON.stringify(sel)})`, "elemento existe: " + sel);
    await this.evaluar(`document.querySelector(${JSON.stringify(sel)}).click()`);
    if (msg) asegurar(true, msg);
  }
}

async function main() {
  const PUERTO_APP = 8769;
  const srv = await iniciarServidorLocal({ puerto: PUERTO_APP });
  let chrome;

  try {
    chrome = await lanzarChrome();
    const p = await Pestana.abrir(`http://127.0.0.1:${PUERTO_APP}/?usuario=${encodeURIComponent(USUARIO)}`);

    console.log("Verificación 1: Carga inicial y Menú Principal");
    await p.esperar('!document.getElementById("v-menu").hidden', "El menú principal (#v-menu) está visible y no oculto");
    await p.esperar('document.getElementById("u-correo").textContent.includes("mfloresl")', "La cabecera muestra el correo de Director");
    await p.esperar('document.getElementById("u-rol").textContent.includes("Director")', "La cabecera muestra el rol de Director");

    console.log("Verificación 2: Entrada a CU-002 Carga de Docentes");
    await p.pulsar("#op-docentes", "Pulsar «Asignar docentes al plan de ciclo (CU-002)» en el menú");
    await p.esperar('!document.getElementById("v-docentes").hidden', "El panel #v-docentes está visible y activo");
    await p.esperar('document.getElementById("v-menu").hidden', "El panel del menú se ocultó correctamente");

    console.log("Verificación 3: Métricas y datos de CU-002");
    await p.esperar('parseInt(document.getElementById("met-doc-req").textContent, 10) > 0', "Horas requeridas calculadas (> 0)");
    await p.esperar('document.getElementById("met-doc-cob").textContent.includes("%")', "Porcentaje de cobertura visible");
    await p.esperar('document.querySelectorAll("#tb-vista-dpto tr").length > 0', "Filas de docentes renderizadas en vista departamento");

    console.log("Verificación 4: Conmutación de vistas (Departamento ↔ Carrera)");
    await p.pulsar("#btn-vista-carrera", "Cambiar a Vista por Carrera");
    await p.esperar('!document.getElementById("vista-carrera-contenedor").hidden', "Contenedor de vista carrera visible");
    await p.esperar('document.getElementById("vista-dpto-contenedor").hidden', "Contenedor de vista departamento oculto");
    await p.esperar('document.querySelectorAll("#tb-vista-carrera tr").length > 0', "Asignaturas renderizadas en vista carrera");

    console.log("Verificación 5: Flujo Alternativo FA-001 - Cátedra Compartida (Teoría y Práctica)");
    await p.esperar('document.querySelector("[data-acc-asig=\'compartida\']") !== null', "Botón Cátedra disponible en curso con HT > 0 y HP > 0");
    await p.pulsar("[data-acc-asig='compartida']", "Pulsar botón Cátedra en la grilla");
    await p.esperar('document.getElementById("dlg").open', "Modal de Cátedra Compartida abierto");
    await p.evaluar(`(() => {
      const st = document.getElementById("dlg-doc-teoria");
      if (st && st.options.length > 1) st.selectedIndex = 1;
      const sp = document.getElementById("dlg-doc-practica");
      if (sp && sp.options.length > 2) sp.selectedIndex = 2;
    })()`);
    await p.evaluar(`(() => {
      const btns = Array.from(document.querySelectorAll("#dlg-pie button"));
      const btnOk = btns.find(b => b.textContent.includes("Confirmar"));
      if (btnOk) btnOk.click();
    })()`);
    await p.esperar('!document.getElementById("dlg").open', "Modal de Cátedra Compartida cerrado tras confirmar");
    await p.esperar('document.body.textContent.includes("Cátedra compartida (FA-001)")', "Insignia de Cátedra Compartida visible en la vista carrera");

    await p.pulsar("#btn-vista-dpto", "Volver a Vista por Departamento");
    await p.esperar('!document.getElementById("vista-dpto-contenedor").hidden', "Contenedor de vista departamento restaurado");

    console.log("Verificación 6: Flujo Alternativo FA-002 - Reemplazo de Docente (Licencia / Sustitución)");
    await p.esperar('document.querySelector("[data-acc-doc=\'reemplazar-doc\']") !== null', "Botón Reemplazar disponible en la vista departamento");
    await p.pulsar("[data-acc-doc='reemplazar-doc']", "Pulsar botón Reemplazar en fila de docente");
    await p.esperar('document.getElementById("dlg").open', "Modal de Reemplazo de Docente abierto");
    await p.evaluar(`(() => {
      const sust = document.getElementById("dlg-sel-sustituto");
      if (sust && sust.options.length > 1) sust.selectedIndex = 1;
      const mot = document.getElementById("dlg-motivo-reemplazo");
      if (mot) mot.value = "Licencia médica";
    })()`);
    await p.evaluar(`(() => {
      const btns = Array.from(document.querySelectorAll("#dlg-pie button"));
      const btnOk = btns.find(b => b.textContent.includes("Confirmar"));
      if (btnOk) btnOk.click();
    })()`);
    await p.esperar('!document.getElementById("dlg").open', "Modal de Reemplazo cerrado tras confirmación");

    console.log("Verificación 7: Carga Masiva Rejilla / Archivo (Flujo Básico)");
    await p.pulsar("#btn-doc-masiva", "Abrir panel de carga masiva de asignaciones");
    await p.esperar('!document.getElementById("v-docentes-carga").hidden', "Panel #v-docentes-carga visible");
    await p.esperar('document.getElementById("v-docentes").hidden', "Panel #v-docentes oculto durante la carga masiva");

    await p.pulsar("#volver-doc-carga", "Pulsar volver a carga de docentes");
    await p.esperar('!document.getElementById("v-docentes").hidden', "Regresa al panel #v-docentes");

    console.log("Verificación 8: Errores en consola");
    asegurar(p.errores.length === 0, "Cero errores o excepciones de JavaScript en la consola (" + p.errores.join(", ") + ")");

    console.log(`\n¡ÉXITO TOTAL! ${comprobaciones} comprobaciones E2E de CU-002 superadas sin errores.`);
  } finally {
    if (chrome) {
      chrome.proceso.kill();
      try { fs.rmSync(chrome.perfil, { recursive: true, force: true }); } catch {}
    }
    if (srv && srv.cerrar) await srv.cerrar();
  }
}

main().catch(err => {
  console.error("Error en prueba E2E:", err);
  process.exit(1);
});
