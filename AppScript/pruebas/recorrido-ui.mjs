/* Recorrido de la interfaz en Chrome sin ventana, contra la vista previa local.
   Controla el navegador con el protocolo DevTools (WebSocket de Node), sin dependencias.

     node AppScript/pruebas/recorrido-ui.mjs [carpeta-de-capturas]

   Usa google-chrome-stable (o la ruta de la variable CHROME). Tarda un par de minutos
   porque espera a que caduque un bloqueo de un minuto. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iniciarServidorLocal } from "./servidor-local.mjs";
import { XLSX_CARRERA } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe", B = "fmaresg@ulasalle.edu.pe";
const CAPTURAS = path.resolve(process.argv[2] || path.join(os.tmpdir(), "sis-capturas"));
const PUERTO_CDP = 9333;
const dormir = ms => new Promise(r => setTimeout(r, ms));

let pasos = 0;
function asegurar(cond, msg) {
  if (!cond) throw new Error("Falló: " + msg);
  pasos++;
  console.log("  ✔ " + msg);
}

async function lanzarChrome() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "sis-chrome-"));
  const proceso = spawn(process.env.CHROME || "google-chrome-stable", [
    "--headless=new", "--remote-debugging-port=" + PUERTO_CDP, "--user-data-dir=" + perfil,
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank"
  ], { stdio: "ignore" });
  for (let i = 0; i < 75; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).ok) return { proceso, perfil }; } catch { /* aún arranca */ }
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
  async esperarQuizas(expr, ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (await this.evaluar(expr)) return true;
      await dormir(100);
    }
    return false;
  }
  pulsar(selector) { return this.evaluar(`document.querySelector(${JSON.stringify(selector)}).click()`); }
  texto(selector) { return this.evaluar(`(document.querySelector(${JSON.stringify(selector)}) || {}).textContent || ""`); }
  async dialogo(boton) {
    await this.esperar(`document.querySelector("#dlg").open`, "se abre el diálogo para «" + boton + "»");
    const ok = await this.evaluar(`(() => { const b = [...document.querySelectorAll("#dlg-pie button")].find(b => b.textContent === ${JSON.stringify(boton)}); if (b) b.click(); return !!b; })()`);
    asegurar(ok, "pulsar «" + boton + "» en el diálogo");
    await dormir(80);
  }
  resumen(selector = "#resumen") {
    return this.evaluar(`Object.fromEntries([...document.querySelectorAll("${selector} div")].map(d => [d.querySelector("dt").textContent, +d.querySelector("dd").textContent]))`);
  }
  filasTablero() {
    return this.evaluar(`[...document.querySelectorAll("#tb-tablero tr")].map(tr => ({ sig: tr.dataset.sig, celdas: [...tr.cells].map(td => td.textContent.trim()), editar: !!tr.querySelector("[data-accion=editar]") }))`);
  }
  async captura(nombre) {
    const r = await this.enviar("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(CAPTURAS, nombre), Buffer.from(r.data, "base64"));
  }
  async subirArchivo(selector, ruta) {
    const { root } = await this.enviar("DOM.getDocument");
    const { nodeId } = await this.enviar("DOM.querySelector", { nodeId: root.nodeId, selector });
    await this.enviar("DOM.setFileInputFiles", { nodeId, files: [ruta] });
  }
  cerrar() { this.ws.close(); }
}

async function recorrido(srv) {
  const url = u => srv.url + "?usuario=" + encodeURIComponent(u);

  console.log("Director: menú, tablero y consulta");
  const pa = await Pestana.abrir(url(A));
  await pa.esperar(`!document.querySelector("#v-menu").hidden`, "arranca en el menú");
  asegurar(await pa.texto("#u-correo") === A && await pa.texto("#u-rol") === "Coordinador de ADM, DER, ING, ICO, COM, PSI, ARQ y IND", "la cabecera muestra la cuenta y el rol");
  asegurar(await pa.evaluar(`typeof XLSX === "undefined"`), "SheetJS no se descarga al abrir la página");
  await pa.pulsar("#op-planes");
  await pa.esperar(`document.querySelectorAll("#tb-tablero tr").length === 8 && [...document.querySelectorAll("#tb-tablero .pill")].every(p => p.textContent === "Registrado")`,
    "el tablero lista las 8 carreras, leídas de las pestañas de fondo");
  let filas = await pa.filasTablero();
  asegurar(filas.every(f => f.celdas[1] === "Registrado" && f.celdas[6] === "v1"), "todas Registrado v1, leídas de las pestañas");
  asegurar(filas.reduce((n, f) => n + Number(f.celdas[4]), 0) === 365, "suman 365 grupos");
  await pa.captura("01-tablero.png");

  await pa.pulsar("#btn-releer");
  await pa.esperar(`[...document.querySelectorAll("#brindis div")].some(d => d.textContent === "Hoja revisada")`, "«Releer la hoja» lee las pestañas");

  const antesConsulta = await pa.evaluar("window.__llamadas.length");
  await pa.pulsar('#tb-tablero tr[data-sig="DER"]');
  await pa.esperar(`!document.querySelector("#v-lectura").hidden`, "la fila abre la consulta en solo lectura");
  asegurar((await pa.resumen("#lectura-resumen")).Asignaturas === 80, "Derecho tiene 80 asignaturas");
  asegurar(!(await pa.evaluar(`window.__llamadas.slice(${antesConsulta})`)).includes("consultaObtener"), "consultar no llama al servidor");
  await pa.pulsar("#v-lectura [data-accion=volverAlTablero]");
  await pa.esperar(`!document.querySelector("#v-planes").hidden`, "vuelve al tablero");

  console.log("Director: edición de Ingeniería de Software");
  await pa.esperar(`!!document.querySelector('[data-accion="editar"][data-sig="ING"]')`, "botón Editar disponible");
  const alInstante = await pa.evaluar(`(() => {
    document.querySelector('[data-accion="editar"][data-sig="ING"]').click();
    return { grilla: !document.querySelector("#v-grilla").hidden, reloj: document.querySelector("#reloj-grilla").textContent,
             guardar: document.querySelector("#btn-registrar").disabled };
  })()`);
  asegurar(alInstante.grilla && alInstante.reloj === "Tomando el bloqueo de edición…" && alInstante.guardar,
    "«Editar» abre la grilla al instante y no deja guardar hasta confirmar el bloqueo");
  await pa.esperar(`/Sesión de edición: (29|30):\\d\\d/.test(document.querySelector("#reloj-grilla").textContent) && !document.querySelector("#btn-registrar").disabled`,
    "el bloqueo se confirma y arranca el reloj");
  asegurar((await pa.texto("#nota-estado")).includes("Registrado (v1)"), "nota de estado Registrado (v1)");

  await pa.evaluar(`window.scrollTo(0, document.body.scrollHeight)`);
  const y0 = await pa.evaluar("scrollY");
  await pa.evaluar(`[...document.querySelectorAll("#bloques tr[data-ci]")].at(-1).click()`);
  await pa.esperar(`!!document.querySelector("#bloques tr.sel")`, "seleccionar una fila");
  const y1 = await pa.evaluar("scrollY");
  asegurar(y0 > 500 && Math.abs(y1 - y0) < 5, "seleccionar una fila no devuelve la página arriba");

  await pa.pulsar('#bloques tr[data-ci="0"][data-gi="0"]');
  await pa.pulsar('[data-accion="desdoblar"]');
  await pa.esperar(`document.querySelector("#dlg").open`, "diálogo de desdoble");
  await pa.evaluar(`document.querySelector("#d-cant").value = "3"`);
  await pa.dialogo("Desdoblar");
  await pa.esperar(`document.querySelector("#bloques").textContent.includes("PRA×3")`, "marca PRA×3");
  asegurar((await pa.resumen()).Desdobles === 1, "el resumen cuenta 1 desdoble");
  asegurar(!(await pa.evaluar(`document.querySelector('[data-accion="quitarDesdoble"]').disabled`)), "«Quitar desdoble» se habilita");
  await pa.pulsar('[data-accion="quitarDesdoble"]');
  await pa.dialogo("Quitar desdoble");
  await pa.esperar(`!document.querySelector("#bloques").textContent.includes("PRA×3")`, "se quita el desdoble");

  const horas = () => pa.evaluar(`[...document.querySelector('#bloques tr[data-ci="1"][data-gi="0"]').cells].slice(4, 6).map(c => c.textContent)`);
  const antes = await horas();
  await pa.pulsar('[data-accion="fusionarGrupos"]');
  await pa.esperar(`document.querySelector("#dlg").open`, "diálogo de fusión");
  await pa.evaluar(`(() => { const s = document.querySelector("#f-grupos"); [...s.options].forEach(o => { o.selected = o.value === "0:0" || o.value === "1:0"; }); document.querySelector("#f-principal").value = "0:0"; })()`);
  await pa.dialogo("Fusionar");
  await pa.esperar(`document.querySelector("#dlg").open && document.querySelector("#dlg-titulo").textContent.includes("advertencias")`, "aviso A05 por grupos distintos");
  await pa.captura("02-fusion-a05.png");
  await pa.dialogo("Entendido");
  asegurar((await pa.resumen()).Fusiones === 1, "el resumen cuenta 1 fusión");
  const fusionado = await horas();
  asegurar(JSON.stringify(fusionado) !== JSON.stringify(antes), "el grupo fusionado toma las horas del principal (" + antes + " → " + fusionado + ")");
  await pa.pulsar('#bloques tr[data-ci="1"][data-gi="0"]');
  await pa.pulsar('[data-accion="deshacerFusion"]');
  await pa.dialogo("Deshacer");
  await pa.esperar(`!document.querySelector("#bloques .marca-c.fus")`, "se deshace la fusión");
  asegurar((await pa.resumen()).Fusiones === 0, "el resumen vuelve a 0 fusiones");
  asegurar(JSON.stringify(await horas()) === JSON.stringify(antes), "el grupo recupera sus horas (" + antes + ")");

  const gruposAntes = (await pa.resumen()).Grupos;
  await pa.pulsar('[data-accion="agregarGrupo"]');
  asegurar((await pa.resumen()).Grupos === gruposAntes + 1, "agregar grupo suma uno (" + gruposAntes + " → " + (gruposAntes + 1) + ")");

  await pa.pulsar("#btn-registrar");
  await pa.esperar(`!!document.querySelector("#motivo")`, "pide el motivo del cambio");
  await pa.evaluar(`document.querySelector("#motivo").value = "Matrícula extemporánea"`);
  await pa.dialogo("Confirmar");
  await pa.esperar(`document.querySelector("#nota-estado").textContent.includes("(v2)")`, "guardar cambios crea la v2");
  await pa.captura("03-grilla.png");

  console.log("Segunda cuenta: el plan en edición se ve bloqueado");
  const pb = await Pestana.abrir(url(B));
  await pb.pulsar("#op-planes");
  await pb.esperar(`document.querySelectorAll("#tb-tablero tr").length === 8`, "tablero de la segunda cuenta, que llega con la página");
  filas = await pb.filasTablero();
  const ing = filas.find(f => f.sig === "ING");
  asegurar(ing.celdas[1] === "Bloqueado" && ing.celdas[7] === A && ing.celdas[6] === "v2", "ING aparece bloqueado por " + A + " en v2");
  await pb.pulsar('[data-accion="editar"][data-sig="ING"]');
  await pb.dialogo("Consultar en solo lectura");
  await pb.esperar(`!document.querySelector("#v-lectura").hidden && document.querySelector("#lectura-nota").textContent.includes(${JSON.stringify(A)})`, "abre en solo lectura e indica quién edita");
  await pb.captura("04-bloqueado.png");

  console.log("Director: historial, restauración y salida");
  await pa.pulsar('[data-accion="historialDeVersiones"]');
  await pa.esperar(`document.querySelector("#dlg").open && document.querySelectorAll("#dlg-cuerpo tbody tr").length === 2`, "el historial lista v1 y v2");
  await pa.evaluar(`document.querySelector("#v-restaurar").value = "1"`);
  await pa.dialogo("Restaurar");
  await pa.esperar(`document.querySelector("#nota-estado").textContent.includes("(v3)")`, "restaurar v1 crea la v3");
  await pa.pulsar("#volver-grilla");
  await pa.dialogo("Salir");
  await pa.esperar(`!document.querySelector("#v-planes").hidden && document.querySelector('#tb-tablero tr[data-sig="ING"]').cells[7].textContent.trim() === "—"`, "sale y libera el bloqueo");
  asegurar((await pa.filasTablero()).find(f => f.sig === "ING").celdas[6] === "v3", "el tablero muestra la v3");

  console.log("Director: plan nuevo por pegado en 2026-2");
  await pa.evaluar(`(() => { const s = document.querySelector("#sel-ciclo"); s.value = "2026-2"; s.dispatchEvent(new Event("change")); })()`);
  await pa.esperar(`document.querySelectorAll("#tb-tablero tr").length === 8 && [...document.querySelectorAll("#tb-tablero .pill")].every(p => p.textContent === "Sin Iniciar")`, "2026-2 está Sin Iniciar");
  await pa.pulsar('[data-accion="editar"][data-sig="ING"]');
  await pa.esperar(`!document.querySelector("#v-carga").hidden`, "un plan vacío abre la carga masiva");
  await pa.pulsar("#op-pegar");
  const tsv = [
    "CARRERA\tMALLA\tSEMESTRE\tCÓDIGO\tASIGNATURA\tGRUPO\tHT\tHP\tTOTAL HORAS\tDPTO\tOBSERVACIONES",
    "ING\t2024\t1\t3.1.1.24\tIntroducción a la Programación\t\t2\t4\t6\tDIMA\t",
    "ING\t2024\t1-2\t3.1.1.24\tIntroducción a la Programación\t\t2\t4\t6\tDIMA\t",
    "Ing. Software\t2024\t2\t3.2.1.24\tEstructuras de Datos\t1\t2\t4\t6\tDIMA\tVIRTUAL",
    "ADM\t2024\t1\t1.1.1.24\tComunicación I\t1\t2\t2\t4\tDAHUC\t"
  ].join("\n");
  await pa.evaluar(`(() => { const dt = new DataTransfer(); dt.setData("text/plain", ${JSON.stringify(tsv)}); document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true })); })()`);
  await pa.esperar(`document.querySelector("#hoja-pie").textContent.includes("Cabeceras detectadas en la fila 1")`, "la rejilla muestra lo pegado y detecta las cabeceras");
  await pa.captura("05-pegado.png");
  await pa.pulsar("#procesar-pegado");
  await pa.esperar(`!document.querySelector("#v-grilla").hidden`, "procesar lleva a la grilla");
  asegurar((await pa.texto("#nota-importacion")).startsWith("1 fila de otra carrera se ignoró"), "avisa de la fila de otra carrera");
  const r = await pa.resumen();
  asegurar(r.Asignaturas === 2 && r.Grupos === 3 && r["Intl. / virtual"] === 1, "2 asignaturas, 3 grupos, 1 virtual");
  await pa.esperar(`!document.querySelector("#btn-registrar").disabled`, "el bloqueo ya está confirmado");
  await pa.pulsar("#btn-registrar");
  await pa.dialogo("Confirmar y registrar");
  await pa.esperar(`!document.querySelector("#v-exito").hidden && document.querySelector("#exito-nota").textContent.includes("versión v1")`, "registro completado en v1");
  await pa.pulsar("#v-exito [data-accion=volverAlTablero]");
  await pa.esperar(`(() => { const tr = document.querySelector('#tb-tablero tr[data-sig="ING"]'); return tr && tr.cells[1].textContent === "Registrado" && tr.cells[7].textContent.trim() === "—"; })()`, "ING 2026-2 queda Registrado y sin bloqueo");

  console.log("Director: subir un .xlsx con varias hojas");
  await pa.pulsar('[data-accion="editar"][data-sig="ADM"]');
  await pa.esperar(`!document.querySelector("#v-carga").hidden`, "carga masiva de ADM");
  const hayXLSX = await pa.esperarQuizas(`typeof XLSX !== "undefined"`, 15000);
  if (!hayXLSX) {
    console.log("  ⚠ SheetJS no cargó desde cdn.sheetjs.com (¿sin internet?): se omite la subida de .xlsx");
    await pa.pulsar("#volver-carga");
  } else {
    asegurar(true, "al entrar en la carga masiva se descarga SheetJS");
    await pa.subirArchivo("#input-archivo", XLSX_CARRERA);
    await pa.esperar(`document.querySelector("#dlg").open && !!document.querySelector("#sel-hoja")`, "pregunta qué hoja importar");
    await pa.evaluar(`document.querySelector("#sel-hoja").value = "Adm. Neg. Int."`);
    await pa.dialogo("Importar la hoja");
    await pa.esperar(`!document.querySelector("#v-grilla").hidden`, "importa la hoja");
    const ra = await pa.resumen();
    asegurar(ra.Asignaturas === 60 && ra.Grupos === 60, "la hoja de ADM da 60 asignaturas y 60 grupos");
    await pa.esperar(`!document.querySelector("#btn-borrador").disabled`, "se puede guardar el borrador");
    await pa.pulsar("#btn-borrador");
    await pa.dialogo("Guardar");
    await pa.esperar(`document.querySelector("#nota-estado").textContent.includes("Borrador (v1)")`, "se guarda como Borrador v1");
    await pa.pulsar("#volver-grilla");
    await pa.dialogo("Salir");
  }

  console.log("Coordinador y acceso denegado");
  srv.entorno.hoja("Usuarios").getRange(8, 1, 1, 3).setNumberFormat("@").setValues([["coord@ulasalle.edu.pe", "coordinador", "ING"]]);
  const pc = await Pestana.abrir(url("coord@ulasalle.edu.pe"));
  await pc.esperar(`document.querySelector("#u-rol").textContent === "Coordinador de Ingeniería de Software"`, "rol de coordinador de ING");
  await pc.pulsar("#op-planes");
  await pc.esperar(`document.querySelectorAll("#tb-tablero tr").length === 8`, "tablero del coordinador");
  filas = await pc.filasTablero();
  asegurar(filas.filter(f => f.editar).map(f => f.sig).join() === "ING", "solo puede editar ING");
  const pd = await Pestana.abrir(url("alguien@gmail.com"));
  await pd.esperar(`!document.querySelector("#v-denegado").hidden && document.querySelector("#denegado-msg").textContent.includes("no pertenece al dominio")`, "otra cuenta ve acceso denegado");
  await pd.captura("06-denegado.png");

  console.log("Expiración del bloqueo con SIS_MINUTOS_BLOQUEO = 1 (espera un minuto)");
  srv.entorno.propiedades.SIS_MINUTOS_BLOQUEO = "1";
  const pe = await Pestana.abrir(url(A));
  await pe.pulsar("#op-planes");
  await pe.esperar(`!!document.querySelector('[data-accion="editar"][data-sig="PSI"]')`, "tablero listo");
  await pe.pulsar('[data-accion="editar"][data-sig="PSI"]');
  await pe.esperar(`!document.querySelector("#v-grilla").hidden`, "edita PSI");
  await pe.pulsar('#bloques tr[data-ci="0"][data-gi="0"]');
  await pe.pulsar('[data-accion="agregarGrupo"]');
  await pe.esperar(`document.querySelector("#dlg").open && document.querySelector("#dlg-titulo").textContent === "La sesión de edición ha expirado"`, "al minuto expira", 90000);
  asegurar((await pe.texto("#dlg-cuerpo")).includes("se almacenaron como una nueva versión"), "autoguardó los cambios");
  await pe.dialogo("Entendido");
  await pe.esperar(`(() => { const tr = document.querySelector('#tb-tablero tr[data-sig="PSI"]'); return tr && tr.cells[6].textContent === "v2" && tr.cells[7].textContent.trim() === "—"; })()`, "PSI queda en v2 y sin bloqueo");
  srv.entorno.propiedades.SIS_MINUTOS_BLOQUEO = "30";

  const errores = [pa, pb, pc, pd, pe].flatMap(p => p.errores).filter(e => !/cdn\.sheetjs\.com|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(e));
  asegurar(errores.length === 0, "sin errores en la consola" + (errores.length ? ": " + errores.join(" | ") : ""));
  [pa, pb, pc, pd, pe].forEach(p => p.cerrar());
}

fs.mkdirSync(CAPTURAS, { recursive: true });
const srv = await iniciarServidorLocal({ puerto: 0 });
const { proceso, perfil } = await lanzarChrome();
let fallo = null;
try {
  await recorrido(srv);
} catch (e) {
  fallo = e;
} finally {
  proceso.kill();
  await srv.cerrar();
  await dormir(300);
  fs.rmSync(perfil, { recursive: true, force: true });
}
if (fallo) {
  console.error("\n✖ " + fallo.message);
  process.exit(1);
}
console.log(`\n${pasos} comprobaciones superadas. Capturas en ${CAPTURAS}`);
