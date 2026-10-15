/* Recorrido E2E específico para CU-002: Carga y Gestión de Docentes.
   Controla Chrome headless mediante el protocolo DevTools (CDP). */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iniciarServidorLocal } from "./servidor-local.mjs";

const USUARIO = "jhuamanih@ulasalle.edu.pe";          // director del DIMA
const COORDINADOR = "mfloresl@ulasalle.edu.pe";
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
    const url = u => `http://127.0.0.1:${PUERTO_APP}/?usuario=${encodeURIComponent(u)}`;
    const pie = texto => `[...document.querySelectorAll("#dlg-pie button")].find(b => b.textContent.includes(${JSON.stringify(texto)})).click()`;

    console.log("Verificación 1: el coordinador consulta la asignación en solo lectura");
    const c = await Pestana.abrir(url(COORDINADOR));
    await c.esperar('!document.getElementById("v-menu").hidden', "Menú principal visible");
    await c.pulsar("#op-docentes", "Entrar en «Asignar docentes al plan de ciclo»");
    await c.esperar('!document.getElementById("v-docentes").hidden && document.querySelectorAll("#tb-vista-carrera tr").length > 0', "Secciones de la carrera listadas");
    await c.esperar('document.getElementById("btn-doc-editar").hidden && !document.querySelector("[data-acc-sec]")', "Sin botones de edición para el coordinador");
    asegurar(c.errores.length === 0, "Sin errores en la consola del coordinador (" + c.errores.join(", ") + ")");

    console.log("Verificación 2: el director entra a la primera carrera de su departamento");
    const p = await Pestana.abrir(url(USUARIO));
    await p.esperar('document.getElementById("u-rol").textContent === "Director del DIMA · Ingeniería y Matemáticas"', "La cabecera dice de qué departamento es el director");
    await p.pulsar("#op-docentes", "Entrar en la asignación docente");
    await p.esperar('document.getElementById("sel-doc-carrera").value === "ING" && parseInt(document.getElementById("met-doc-req").textContent, 10) > 0', "Abre en ING con las horas pedidas");
    asegurar(await p.evaluar('[...document.querySelectorAll("#sel-doc-carrera optgroup")].map(g => g.label.split(" ")[0]).join(",") === "DIMA,DAHUC,DACJ,DACTE"'), "Las carreras se agrupan por el departamento que las asigna");
    await p.esperar('!document.getElementById("btn-doc-editar").hidden', "Puede editar la carga de ING");
    await p.evaluar('(() => { const s = document.getElementById("sel-doc-carrera"); s.value = "ADM"; s.dispatchEvent(new Event("change")); })()');
    await p.esperar('appCarga.datos && appCarga.datos.carrera === "ADM" && document.getElementById("btn-doc-editar").hidden && /solo lectura/.test(document.getElementById("doc-subtitulo").textContent)', "ADM es de DACTE: la consulta en solo lectura");
    await p.evaluar('(() => { const s = document.getElementById("sel-doc-carrera"); s.value = "ING"; s.dispatchEvent(new Event("change")); })()');
    await p.esperar('appCarga.datos && appCarga.datos.carrera === "ING" && !document.getElementById("btn-doc-editar").hidden', "Vuelve a ING");

    console.log("Verificación 3: edición con bloqueo y asignación por componente");
    await p.pulsar("#btn-doc-editar", "Pulsar «Editar asignaciones»");
    await p.esperar('appCarga.editando && /Sesión de edición/.test(document.getElementById("reloj-asignacion").textContent)', "Bloqueo tomado y reloj en marcha");
    await p.pulsar('#tb-vista-carrera [data-acc-sec="asignar"]', "Abrir la ventana de asignación de una sección");
    await p.esperar('document.getElementById("dlg").open && document.querySelectorAll("#dlg-cuerpo [data-comp]").length >= 1', "Ventana con un bloque por componente");
    await p.evaluar(`(() => { const n = appCarga.datos.catalogo.find(d => d.dpto === "DIMA").nombreCompleto;
      document.querySelectorAll("#dlg-cuerpo [data-doc]").forEach(i => { i.value = n; }); })()`);
    await p.evaluar(pie("Guardar en la carga"));
    await p.esperar('appCarga.sucio && document.querySelector("#tb-vista-carrera .badge-doc.ok")', "La sección queda cubierta y hay cambios sin guardar");

    console.log("Verificación 4: guardar crea una versión");
    await p.pulsar("#btn-doc-guardar", "Pulsar «Guardar asignaciones»");
    await p.esperar('document.getElementById("dlg").open && /A13/.test(document.getElementById("dlg-cuerpo").textContent)', "La confirmación avisa de los componentes sin docente (A13)");
    await p.evaluar(pie("Confirmar y guardar"));
    await p.esperar('!appCarga.sucio && appCarga.base === 1', "Carga guardada como v1");

    console.log("Verificación 5: reemplazo de docente con fecha de efectividad");
    await p.pulsar('#tb-vista-carrera [data-acc-sec="reemplazar"]', "Pulsar «Reemplazar» en la sección");
    await p.esperar('document.getElementById("dlg").open && !!document.getElementById("dlg-fecha")', "Ventana de reemplazo con fecha de efectividad");
    await p.evaluar(`(() => { const t = appCarga.trabajo[0].docente;
      document.getElementById("dlg-sust").value = appCarga.datos.catalogo.find(d => d.nombreCompleto !== t).nombreCompleto; })()`);
    await p.evaluar(pie("Confirmar reemplazo"));
    await p.esperar('appCarga.trabajo.some(a => a.reemplazo && a.historial && a.historial.length)', "El titular queda en el historial de la asignación");

    console.log("Verificación 6: vista por docente e historial");
    await p.pulsar("#btn-vista-dpto", "Cambiar a la vista por docente");
    await p.esperar('!document.getElementById("vista-dpto-contenedor").hidden && document.querySelectorAll("#tb-vista-dpto tr").length > 0', "Docentes con su balance");
    await p.pulsar("#btn-vista-carrera", "Volver a la vista por sección");
    await p.pulsar("#btn-doc-historial", "Abrir el historial de la carga");
    await p.esperar('document.getElementById("dlg").open && /v1/.test(document.getElementById("dlg-cuerpo").textContent)', "El historial lista la v1");
    await p.evaluar('document.getElementById("dlg").close()');

    console.log("Verificación 7: carga masiva desde la hoja del departamento");
    await p.pulsar("#btn-doc-masiva", "Abrir la carga masiva");
    await p.esperar('!document.getElementById("v-docentes-carga").hidden', "Panel de carga masiva visible");
    await p.evaluar(`rejillaDocentes.pintar([
      ["DOCENTE","CARRERA","MALLA","SEMESTRE","CODIGO","ASIGNATURA","HT","HP","TOTAL HORAS","CONDICIÓN"],
      ["APAZA VALDIVIA ADELUZ","ING","2024","2","3.2.3.24","Cálculo I","2","4","6",""],
      ["","","","","","","","TOTAL","6",""]])`);
    await p.pulsar("#btn-procesar-pegado-doc", "Previsualizar");
    await p.esperar('!document.getElementById("caja-previa-doc").hidden && document.querySelectorAll("#tb-previa-doc tr").length === 1', "Una fila leída; la de TOTAL se ignora");
    await p.evaluar('document.querySelectorAll("#tb-resolver-doc select").forEach(s => { s.value = "tal-cual"; })');
    await p.pulsar("#btn-aplicar-previa-doc", "Aplicar a la asignación");
    await p.esperar('!document.getElementById("v-docentes").hidden && appCarga.sucio', "Vuelve a la asignación con los cambios aplicados");

    console.log("Verificación 8: terminar la edición libera el bloqueo");
    await p.pulsar("#btn-doc-terminar", "Pulsar «Terminar edición»");
    await p.evaluar(pie("Terminar"));
    await p.esperar('!appCarga.editando && !document.getElementById("btn-doc-editar").hidden', "Fuera de la edición");

    console.log("Verificación 9: errores en consola");
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
