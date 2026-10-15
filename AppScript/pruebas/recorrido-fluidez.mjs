/* Recorrido de la navegación entre secciones y de las pestañas del navegador (P149), en Chrome
   sin ventana contra la vista previa local:
     - dos pestañas de la misma cuenta se avisan cuando una toma, guarda o suelta un plan;
     - editar un plan que ya se edita en otra pestaña advierte y deja consultarlo;
     - salir de la edición desde la cabecera pide confirmar;
     - las asignaciones sin guardar sobreviven al cambio de sección sin volver a pedir los datos.

     node AppScript/pruebas/recorrido-fluidez.mjs

   Usa google-chrome-stable (o la ruta de la variable CHROME). */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iniciarServidorLocal } from "./servidor-local.mjs";

const CHROME = process.env.CHROME || "google-chrome-stable";
const PUERTO_CDP = 9352;
const dormir = ms => new Promise(r => setTimeout(r, ms));
const A = "mfloresl@ulasalle.edu.pe", B = "fmaresg@ulasalle.edu.pe";
let ok = 0;
const asegurar = (c, msg) => { if (!c) throw new Error("Falló: " + msg); ok++; console.log("  ✔ " + msg); };

async function lanzarChrome() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "sis-flu-"));
  const proceso = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + PUERTO_CDP, "--user-data-dir=" + perfil,
    "--no-first-run", "--no-default-browser-check", "--window-size=1366,900", "about:blank"], { stdio: "ignore" });
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
    await p.enviar("Page.enable"); await p.enviar("Runtime.enable");
    await p.enviar("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await p.ir(url);
    return p;
  }
  conectar(ws) {
    this.id = 0; this.pendientes = new Map(); this.errores = []; this.cargada = null;
    this.ws = new WebSocket(ws);
    this.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pendientes.has(m.id)) { const { ok, mal } = this.pendientes.get(m.id); this.pendientes.delete(m.id); m.error ? mal(new Error(m.error.message)) : ok(m.result); }
      else if (m.method === "Runtime.exceptionThrown") this.errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") this.errores.push(m.params.args.map(a => a.value ?? a.description).join(" "));
      else if (m.method === "Page.loadEventFired" && this.cargada) this.cargada();
    };
    return new Promise(r => { this.ws.onopen = r; });
  }
  enviar(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((ok, mal) => this.pendientes.set(id, { ok, mal })); }
  async ir(url) { const c = new Promise(r => { this.cargada = r; }); await this.enviar("Page.navigate", { url }); await c; }
  async evaluar(expr) {
    const r = await this.enviar("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("Error al evaluar «" + expr.slice(0, 90) + "»: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async esperar(expr, msg, ms = 10000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) { if (await this.evaluar(expr)) return asegurar(true, msg); await dormir(100); }
    throw new Error("Tiempo agotado: " + msg + " (" + expr + ")");
  }
  pulsar(sel) { return this.evaluar(`document.querySelector(${JSON.stringify(sel)}).click()`); }
  async dialogo(boton) {
    await this.esperar(`document.querySelector("#dlg").open`, "se abre el diálogo para «" + boton + "»");
    const hecho = await this.evaluar(`(() => { const b = [...document.querySelectorAll("#dlg-pie button")].find(b => b.textContent === ${JSON.stringify(boton)}); if (b) b.click(); return !!b; })()`);
    asegurar(hecho, "pulsar «" + boton + "»");
    await dormir(120);
  }
  avisos() { return this.evaluar(`[...document.querySelectorAll("#brindis div")].map(d => d.textContent)`); }
}

const srv = await iniciarServidorLocal({ puerto: 0 });
const url = u => srv.url + "?usuario=" + encodeURIComponent(u);
const { proceso, perfil } = await lanzarChrome();
let p1, p2, pb;
try {
  console.log("Dos pestañas de la misma cuenta");
  p1 = await Pestana.abrir(url(A));
  p2 = await Pestana.abrir(url(A));
  await p1.esperar(`!document.querySelector("#v-menu").hidden`, "pestaña 1 en el inicio");
  await p2.esperar(`!document.querySelector("#v-menu").hidden`, "pestaña 2 en el inicio");
  await p2.pulsar('[data-ir="planes"]');
  await p2.esperar(`!document.querySelector("#v-planes").hidden && document.querySelectorAll("#tb-tablero tr").length === 8`, "la navegación de la cabecera abre el tablero");
  asegurar(await p2.evaluar(`document.querySelector('.nav-op[data-ir="planes"]').classList.contains("activa")`), "la sección activa queda marcada");

  await p1.pulsar('[data-ir="planes"]');
  await p1.esperar(`!!document.querySelector('[data-editar="ING"]')`, "tablero de la pestaña 1");
  await p1.pulsar('[data-editar="ING"]');
  await p1.esperar(`/Sesión de edición/.test(document.querySelector("#reloj-grilla").textContent)`, "la pestaña 1 edita ING");
  await p2.esperar(`(() => { const tr = document.querySelector('#tb-tablero tr[data-sig="ING"]'); return tr && tr.cells[7].textContent.includes(${JSON.stringify(A)}); })()`, "la pestaña 2 ve el bloqueo sin preguntar al servidor");
  asegurar((await p2.avisos()).some(t => t.startsWith("En otra pestaña empezaste a editar Ingeniería de Software")), "la pestaña 2 avisa que la otra empezó a editar");

  await p2.pulsar('[data-editar="ING"]');
  await p2.esperar(`document.querySelector("#dlg").open && document.querySelector("#dlg-titulo").textContent === "Ya editas este plan en otra pestaña"`, "editar el mismo plan en otra pestaña advierte");
  await p2.dialogo("Consultar en solo lectura");
  await p2.esperar(`!document.querySelector("#v-lectura").hidden`, "y deja consultarlo en solo lectura");

  const version = await p1.evaluar(`app.plan.version`);
  await p1.pulsar('#bloques tr[data-ci="0"][data-gi="0"]');
  await p1.pulsar('[data-acc="agregar-grupo"]');
  await p1.pulsar("#btn-registrar");
  await p1.esperar(`!!document.querySelector("#motivo")`, "pide el motivo del cambio");
  await p1.dialogo("Confirmar");
  await p1.esperar(`document.querySelector("#nota-estado").textContent.includes("(v" + ${version + 1} + ")")`, "la pestaña 1 guarda la v" + (version + 1));
  await p2.esperar(`document.querySelector("#lectura-nota").textContent.includes("v" + ${version + 1})`, "la consulta de la pestaña 2 se actualiza sola a la v" + (version + 1));

  console.log("Salir de la edición desde la cabecera");
  await p1.pulsar('[data-ir="docentes"]');
  await p1.esperar(`document.querySelector("#dlg").open && document.querySelector("#dlg-titulo").textContent === "Salir de la edición"`, "pide confirmar antes de salir de la edición");
  await p1.dialogo("Seguir editando");
  asegurar(await p1.evaluar(`!document.querySelector("#v-grilla").hidden`), "«Seguir editando» se queda en la grilla");
  await p1.pulsar('[data-ir="docentes"]');
  await p1.dialogo("Salir");
  await p1.esperar(`!document.querySelector("#v-docentes").hidden && document.querySelectorAll("#tb-vista-dpto tr").length > 0`, "sale y abre la asignación docente");
  await p2.esperar(`(() => { const tr = document.querySelector('#tb-tablero tr[data-sig="ING"]'); return tr && tr.cells[7].textContent.trim() === "—"; })()`, "la pestaña 2 ve el plan libre");
  asegurar((await p2.avisos()).some(t => t.includes("quedó libre")), "y avisa que ya se puede editar");

  console.log("Asignaciones sin guardar al cambiar de sección");
  await p1.pulsar("#btn-vista-carrera");
  await p1.esperar(`!!document.querySelector("[data-acc-asig='asignar']")`, "hay asignaturas por asignar");
  await p1.pulsar("[data-acc-asig='asignar']");
  await p1.esperar(`document.querySelector("#dlg").open`, "ventana de asignación");
  await p1.evaluar(`(() => { const s = document.querySelector("#dlg-sel-doc"); s.selectedIndex = 1; })()`);
  await p1.dialogo("Asignar docente");
  const asignadas = await p1.evaluar(`appDocentes.asignaciones.length`);
  asegurar(await p1.evaluar(`!document.querySelector("#nav-sucio").hidden && !document.querySelector("#doc-sin-guardar").hidden`), "la cabecera marca que hay cambios sin guardar");
  const llamadasAntes = await p1.evaluar(`window.__llamadas.length`);
  await p1.pulsar('[data-ir="planes"]');
  await p1.esperar(`!document.querySelector("#v-planes").hidden`, "va al tablero");
  await p1.pulsar('[data-ir="docentes"]');
  await p1.esperar(`!document.querySelector("#v-docentes").hidden`, "vuelve a la asignación docente");
  asegurar(await p1.evaluar(`appDocentes.asignaciones.length`) === asignadas, "las asignaciones sin guardar siguen ahí (" + asignadas + ")");
  asegurar(!(await p1.evaluar(`window.__llamadas.slice(${llamadasAntes})`)).includes("obtenerEstadoDocentes"), "volver no vuelve a pedir los datos al servidor");

  await p1.evaluar(`(() => { const s = document.querySelector("#sel-doc-dpto"); s.value = "DACJ"; s.dispatchEvent(new Event("change")); })()`);
  await p1.esperar(`document.querySelector("#dlg").open && document.querySelector("#dlg-titulo").textContent === "Hay asignaciones sin guardar"`, "cambiar de departamento con cambios pendientes advierte");
  await p1.dialogo("Seguir aquí");
  asegurar(await p1.evaluar(`document.querySelector("#sel-doc-dpto").value === "DIMA" && appDocentes.dpto === "DIMA"`), "«Seguir aquí» conserva el departamento");

  console.log("Otra cuenta en el mismo navegador");
  pb = await Pestana.abrir(url(B));
  await pb.esperar(`!document.querySelector("#v-menu").hidden`, "segunda cuenta en el inicio");
  await p1.pulsar('[data-ir="planes"]');
  await p1.esperar(`!!document.querySelector('[data-editar="DER"]')`, "tablero");
  await p1.pulsar('[data-editar="DER"]');
  await p1.esperar(`/Sesión de edición/.test(document.querySelector("#reloj-grilla").textContent)`, "la cuenta A edita DER");
  await pb.esperar(`[...document.querySelectorAll("#brindis div")].some(d => d.textContent.startsWith(${JSON.stringify(A)} + " empezó a editar Derecho"))`, "la cuenta B ve quién empezó a editar");

  const errores = [p1, p2, pb].flatMap(p => p.errores).filter(e => !/cdn\.sheetjs\.com|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(e));
  asegurar(errores.length === 0, "sin errores en la consola" + (errores.length ? ": " + errores.join(" | ") : ""));
  console.log("\n" + ok + " comprobaciones superadas.");
} finally {
  [p1, p2, pb].forEach(p => { try { p && p.ws.close(); } catch {} });
  proceso.kill();
  await srv.cerrar();
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
