/* Pruebas de la lógica de la aplicación: node --test AppScript/pruebas/logica.test.mjs
   Cargan los .js en un contexto vm con Apps Script falso (recorrido.mjs → crearEntorno) y los
   <script> de las vistas con un Alpine falso. Tres bloques: la carcasa, CU-001 y CU-002. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { RAIZ, crearEntorno, hojasBase, hojaEjemplo, aTsv } from "./recorrido.mjs";

describe("Carcasa · Index.js, IndexVista.html e InicioVista.html", () => {
  const leer = n => fs.readFileSync(path.join(RAIZ, n), "utf8");
  const scripts = html => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const VISTAS = ["IndexVista.html", "InicioVista.html", "PlanDeCicloVista.html", "CargaDocenteVista.html"];

  test("los tres .js se cargan juntos en un mismo ámbito global, como en Apps Script", () => {
    const e = crearEntorno({ usuario: "mfloresl@ulasalle.edu.pe" });
    /* Date es el reloj falso del entorno, no de la app. */
    const publicas = Object.keys(e.ctx).filter(k => typeof e.ctx[k] === "function" && !/_$/.test(k) && k !== "Date").sort();
    assert.deepEqual(publicas, ["cargaAbrir", "cargaBuscarDocentes", "cargaGuardar", "cargaHistorial", "cargaInicio",
      "cargaInterpretar", "cargaMantener", "cargaRestaurar", "cargaSalir", "cargaVersion", "doGet", "include", "indexUsuario",
      "planAbrir", "planCandidatosFusion", "planGuardar", "planHistorial", "planInicio", "planInterpretar", "planMantener",
      "planRestaurar", "planSalir", "planVersion"]);
  });

  test("ninguna función ni variable se usa entre PlanDeCiclo.* y CargaDocente.*", () => {
    const nombres = (js, html) => {
      const deJs = [...js.matchAll(/^(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
      /* En las vistas solo cuentan los nombres globales, que llevan el prefijo de su archivo. */
      const deHtml = scripts(html).flatMap(s => [...s.matchAll(/\b(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]))
        .concat([...html.matchAll(/Alpine\.(?:data|store)\("(\w+)"/g)].map(m => m[1])).filter(n => /^(plan|carga|index)/i.test(n));
      return [...new Set(deJs.concat(deHtml))];
    };
    const p = { js: leer("PlanDeCiclo.js"), html: leer("PlanDeCicloVista.html") };
    const c = { js: leer("CargaDocente.js"), html: leer("CargaDocenteVista.html") };
    const usa = (texto, n) => new RegExp("(^|[^\\w$.])" + n.replace(/\$/g, "\\$") + "\\b").test(texto);
    for (const n of nombres(p.js, p.html)) assert.ok(!usa(c.js + c.html, n), "CargaDocente usa \"" + n + "\" de PlanDeCiclo");
    for (const n of nombres(c.js, c.html)) assert.ok(!usa(p.js + p.html, n), "PlanDeCiclo usa \"" + n + "\" de CargaDocente");
    for (const n of nombres(leer("Index.js"), leer("IndexVista.html")))
      assert.ok(!usa(p.js + p.html + c.js + c.html, n), "una vista usa \"" + n + "\" de la carcasa");
  });

  test("indexUsuario: rol y carreras, o \"Acceso denegado\" con el motivo", () => {
    const e = crearEntorno({ usuario: "MFloresL@ulasalle.edu.pe", archivos: ["Index.js"] });
    assert.deepEqual(e.llamar("indexUsuario").datos,
      { acceso: true, correo: "mfloresl@ulasalle.edu.pe", rol: "coordinador", carreras: ["ING"], departamento: "" });
    assert.equal(e.como("fmaresg@ulasalle.edu.pe").llamar("indexUsuario").datos.departamento, "DIMA");
    const motivo = c => e.como(c).llamar("indexUsuario").datos;
    assert.match(motivo("").motivo, /^Cuenta no identificada/);
    assert.match(motivo("alguien@gmail.com").motivo, /^Cuenta fuera del dominio/);
    assert.match(motivo("nadie@ulasalle.edu.pe").motivo, /^Cuenta sin rol/);
    assert.match(motivo("sinrol@ulasalle.edu.pe").motivo, /^Cuenta sin rol/);
    assert.equal(motivo("alguien@gmail.com").acceso, false);
  });

  test("doGet arma la página con Alpine del CDN y las tres vistas", () => {
    const e = crearEntorno({ usuario: "mfloresl@ulasalle.edu.pe" });
    const html = e.ctx.doGet().getContent();
    assert.match(html, /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/alpinejs@3\.17\.5\/dist\/cdn\.min\.js"><\/script>/);
    for (const v of ['x-data="planDeCiclo"', 'x-data="cargaDocente"', "$store.nav.vista === 'inicio'", "$store.nav.vista === 'denegado'"])
      assert.ok(html.includes(v), "falta " + v);
    assert.ok(!html.includes("<?"), "queda un scriptlet sin evaluar");
  });

  test("ninguna vista tiene \"//\" en su JavaScript ni \"<?\", y los <script> compilan", () => {
    for (const v of VISTAS) {
      const html = leer(v);
      if (v !== "IndexVista.html") assert.ok(!html.includes("<?"), v + " tiene \"<?\"");
      for (const s of scripts(html)) {
        assert.ok(!s.includes("//"), v + " tiene \"//\" en un <script>");
        assert.doesNotThrow(() => new vm.Script(s), v + ": el <script> no compila");
      }
    }
  });

  test("ningún atributo booleano de Alpine depende de un texto que pueda ser \"\"", () => {
    for (const v of VISTAS)
      for (const m of leer(v).matchAll(/:(disabled|checked|selected|readonly|required|hidden)="([^"]*)"/g))
        assert.ok(!/^\s*ocupado\s*$/.test(m[2]) && !/\|\|\s*ocupado\s*$/.test(m[2]), v + ': :' + m[1] + '="' + m[2] + '"');
  });

  test("la navegación usa $store.nav y la barra marca la vista activa", () => {
    const html = leer("IndexVista.html") + leer("InicioVista.html");
    for (const v of ["plan", "carga", "inicio"]) {
      assert.ok(html.includes("@click=\"$store.nav.vista = '" + v + "'\""), "falta el botón de " + v);
      assert.ok(html.includes("activo: $store.nav.vista === '" + v + "'"), "falta :class activo de " + v);
    }
    assert.match(leer("IndexVista.html"), /Alpine\.store\("nav", \{ vista: "inicio" \}\)/);
  });
});

describe("CU-001 · PlanDeCiclo.js y PlanDeCicloVista.html", () => {
  /* Pruebas de CU-001 "Registrar plan de ciclo": PlanDeCiclo.js (servidor, en el Apps Script
     falso de recorrido.mjs) y los métodos de PlanDeCicloVista.html (su <script> en vm, con un
     Alpine falso y google.script.run atendido por el mismo entorno). Se unirán en logica.test.mjs.
       node --test AppScript/pruebas/plan.test.mjs */
  const COORD = "mfloresl@ulasalle.edu.pe";      /* coordinador de ING */
  const COORD2 = "jhuamanih@ulasalle.edu.pe";    /* otro coordinador de ING */
  const TODAS = "coord.todas@ulasalle.edu.pe";   /* coordinador de las 8 carreras */
  const DIRECTOR = "fmaresg@ulasalle.edu.pe";
  const CICLO = "2026-1";
  const MIN = 60000;
  const PUBLICAS = ["planInicio", "planAbrir", "planInterpretar", "planCandidatosFusion", "planGuardar",
    "planMantener", "planSalir", "planHistorial", "planVersion", "planRestaurar"];
  const HOJAS = { ADM: "Adm. Neg. Int.", DER: "Derecho", ING: "Ing. Software", ICO: "Ing. Comercial",
    COM: "Cs. de la Comunicación", PSI: "Psicología", ARQ: "Arquitectura", IND: "Ing. Industrial" };
  const SIN_BLOQUEO = "Tu bloqueo venció o lo tomó otra cuenta: lo que no guardaste se perdió.";
  const BOM = String.fromCharCode(0xfeff);
  const ISO_PERU = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-05:00$/;

  const entorno = (usuario = COORD) => crearEntorno({ usuario, archivos: ["PlanDeCiclo.js"] });
  const plano = x => JSON.parse(JSON.stringify(x));
  function datos(e, fn, ...args) {
    const r = e.llamar(fn, ...args);
    assert.equal(r.ok, true, fn + " falló: " + r.error);
    return r.datos;
  }
  function fallo(e, fn, ...args) {
    const r = e.llamar(fn, ...args);
    assert.equal(r.ok, false, fn + " debía fallar");
    assert.deepEqual(Object.keys(r).sort(), ["error", "ok"]);
    return r.error;
  }
  const filasHoja = carrera => hojaEjemplo("CargaXCarrera", HOJAS[carrera]);
  const interpretar = (e, texto, carrera) => datos(e, "planInterpretar", texto, carrera);
  const planReal = (e, carrera) => ({ asignaturas: interpretar(e, aTsv(filasHoja(carrera)), carrera).asignaturas });
  const contar = asignaturas => asignaturas.reduce((n, a) => n + a.grupos.length, 0);
  const aCsv = (filas, sep) => filas.map(f => f.map(c => /[;,"\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(sep)).join("\r\n");
  const asignatura = (plan, codigo) => plan.asignaturas.find(a => a.codigo === codigo);
  const bloqueos = e => e.hojas.Bloqueos.datos.slice(1).filter(f => f.some(Boolean));
  const planes = (e, carrera) => e.hojas.Planes.datos.slice(1).filter(f => f[1] === carrera);

  /** Abre en edición y guarda el plan real de la carrera (transformar puede cambiarlo antes). */
  function guardarReal(e, carrera, usuario = TODAS, transformar) {
    e.como(usuario);
    const abierto = datos(e, "planAbrir", CICLO, carrera);
    assert.equal(abierto.modo, "edicion");
    const plan = planReal(e, carrera);
    if (transformar) transformar(plan);
    return datos(e, "planGuardar", CICLO, carrera, plan, abierto.version);
  }

  /* ---------- La vista en vm ---------- */
  const HTML = fs.readFileSync(path.join(RAIZ, "PlanDeCicloVista.html"), "utf8");
  const SCRIPTS = [...HTML.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(m => !/\bsrc=/.test(m[1] || "")).map(m => m[2]);

  /** google.script.run que atiende el entorno e (de forma asíncrona, como el real). */
  function runDe(e) {
    return () => {
      let exito = () => {}, falla = () => {};
      const p = new Proxy({}, {
        get: (_, k) => {
          if (k === "withSuccessHandler") return f => { exito = f; return p; };
          if (k === "withFailureHandler") return f => { falla = f; return p; };
          return (...args) => setTimeout(() => { let r; try { r = e.llamar(k, ...args); } catch (err) { return falla(err); } exito(r); }, 0);
        }
      });
      return p;
    };
  }

  /** Componente planDeCiclo listo para llamar a sus métodos. */
  function vista(e, run = runDe(e)) {
    let fabrica;
    const confirmaciones = [];
    const ctx = vm.createContext({
      console, setTimeout, setInterval: () => 1, clearInterval: () => {}, TextDecoder,
      window: { addEventListener() {} },
      document: { addEventListener: (n, cb) => { if (n === "alpine:init") cb(); } },
      Alpine: { data: (n, f) => { if (n === "planDeCiclo") fabrica = f; }, store: () => ({ vista: "plan" }) },
      confirm: m => { confirmaciones.push(m); return ctx.respuesta !== false; },
      google: { script: { get run() { return run(); } } }
    });
    SCRIPTS.forEach(s => vm.runInContext(s, ctx));
    return { c: fabrica(), ctx, confirmaciones };
  }

  /* ===================== Estructura ===================== */

  test("PlanDeCiclo.js se carga solo; todo lleva el prefijo plan y las públicas son exactamente las previstas", () => {
    const e = entorno();
    const fuente = fs.readFileSync(path.join(RAIZ, "PlanDeCiclo.js"), "utf8");
    const nombres = [...fuente.matchAll(/^(?:async\s+)?(?:function\*?\s+|(?:const|let|var)\s+)([\w$]+)/gm)].map(m => m[1]);
    /* Una función por acción, escrita de arriba abajo: 10 públicas y unas pocas constantes. */
    assert.ok(nombres.length >= 10);
    assert.deepEqual(nombres.filter(n => !/^plan/i.test(n)), []);
    assert.deepEqual(nombres.filter(n => !n.endsWith("_")).sort(), [...PUBLICAS].sort());
    assert.doesNotMatch(fuente, /^(class|let|if|for)\b/m);
    const ajenas = ["console", "Date", "Session", "SpreadsheetApp", "LockService", "HtmlService", "Utilities"];
    assert.deepEqual(Object.keys(e.ctx).filter(k => !ajenas.includes(k) && !/^plan/.test(k)), []);
    for (const n of PUBLICAS) assert.equal(typeof e.ctx[n], "function", n);
    /* Llamadas a funciones de Index.js o CargaDocente.js; un método como ".indexOf(" no cuenta. */
    assert.doesNotMatch(fuente, /(?<![.\w$])(index|carga)[A-Z]\w*\(/, "no usa funciones de otros archivos");
  });

  test("la vista: <script> sin \"//\" y válido, sin \"<?\", sin nombres del otro CU, con sus x-for y pares de nombres", () => {
    assert.ok(SCRIPTS.length >= 1);
    for (const s of SCRIPTS) {
      assert.ok(!s.includes("//"), "un <script> contiene \"//\"");
      assert.doesNotThrow(() => new vm.Script(s));
    }
    assert.ok(!HTML.includes("<?"));
    assert.doesNotMatch(HTML, /\bcarga[A-Z]\w*/);
    assert.match(HTML, /<section x-show="\$store\.nav\.vista === 'plan'" x-data="planDeCiclo" x-cloak>/);
    for (const xfor of ['x-for="c in carreras"', 'x-for="s in semestres"', 'x-for="f in s.filas"', 'x-for="v in versiones"'])
      assert.ok(HTML.includes(xfor), xfor);
    for (const n of PUBLICAS) assert.ok(HTML.includes('"' + n + '"'), n + " no se llama desde la vista");
    const pares = { inicio: "planInicio", abrir: "planAbrir", interpretar: "planInterpretar", candidatosFusion: "planCandidatosFusion",
      guardar: "planGuardar", mantener: "planMantener", salir: "planSalir", historial: "planHistorial", version: "planVersion", restaurar: "planRestaurar" };
    for (const [metodo, servidor] of Object.entries(pares))
      assert.match(HTML, new RegExp("async " + metodo + "\\([^)]*\\) \\{[\\s\\S]*?\"" + servidor + "\""), metodo + " → " + servidor);
    for (const accion of ["guardar", "interpretar", "historial", "salir", "candidatos"])
      assert.ok(HTML.includes("ocupado === '" + accion + "'"), "texto de carga de " + accion);
    /* Alpine 3 deja puesto disabled con "" (solo lo quita con null, undefined o false): el valor tiene que ser booleano. */
    assert.doesNotMatch(HTML, /:disabled="ocupado"/);
    /* Los botones por grupo no cambian el plan mientras hay una llamada (un cambio durante guardar() se perdería). */
    for (const clic of ["agregarGrupo(f.asig)", "uiQuitarGrupo(f.asig, f.g)", "abrirDesdoble(f.asig, f.g)", "quitarDesdoble(f.g)",
      "abrirFusion(f.asig, f.g)", "deshacerFusion(f.g.fusion.id)"])
      assert.match(HTML, new RegExp('<button[^>]*:disabled="(!!ocupado"|ocupado \\|\\|)[^>]*@click="' + clic.replace(/[.()]/g, "\\$&") + '"'), clic);
  });

  test("cada llamada al servidor de la vista usa los datos si ok, deja el error si no (también por withFailureHandler) y libera ocupado", async () => {
    /* Cada método escribe su propia llamada a google.script.run: se prueba con inicio(). */
    let modo = "bien";
    const run = () => {
      let exito, falla;
      const p = { withSuccessHandler: f => { exito = f; return p; }, withFailureHandler: f => { falla = f; return p; } };
      p.planInicio = () => setTimeout(() => {
        if (modo === "bien") exito({ ok: true, datos: { ciclos: ["2026-1"], ciclo: "2026-1", carreras: [{ sigla: "ING" }] } });
        else if (modo === "mal") exito({ ok: false, error: "Ciclo desconocido: \"x\"." });
        else falla(new Error("Script function not found: planInicio"));
      });
      return p;
    };
    const { c } = vista(entorno(), run);
    const espera = c.inicio();
    assert.equal(c.ocupado, "inicio");
    await espera;
    assert.deepEqual(plano(c.carreras), [{ sigla: "ING" }]);
    assert.equal(c.error, "");
    assert.equal(c.ocupado, "");
    modo = "mal";
    await c.inicio();
    assert.equal(c.error, "Ciclo desconocido: \"x\".");
    assert.equal(c.ocupado, "");
    modo = "roto";
    await c.inicio();
    assert.equal(c.error, "Script function not found: planInicio");
    assert.equal(c.ocupado, "");
    assert.deepEqual(plano(c.carreras), [{ sigla: "ING" }], "un error no borra la tabla");
  });

  /* ===================== Interpretación ===================== */

  test("pegado real de Ing. Software: títulos encima, segunda HT = total, 1-1/1-2 y 3 - 1, orden por semestre y código", () => {
    const e = entorno();
    const r = interpretar(e, aTsv(filasHoja("ING")), "ING");
    assert.equal(r.asignaturas.length, 68);
    assert.equal(contar(r.asignaturas), 75);
    assert.equal(r.filas, 75);
    assert.equal(r.descartadas, 0);
    assert.deepEqual(r.avisos, []);
    assert.deepEqual(r.asignaturas[0], {
      codigo: "3.1.1.24", nombre: "Introducción a la Programación", malla: "2024", semestre: 1, dpto: "DIMA",
      /* La OBS de la fila 1-2 del Excel es de ese grupo, no de la asignatura. */
      grupos: [[1, ""], [2, "Liz Bernedo como Jefe de práctica"]].map(([n, obs]) => ({ n, ht: 2, hp: 4, th: 6, obs, avisos: [], desdoble: null, fusion: null }))
    });
    const lp2 = asignatura(r, "3.3.1.24");
    assert.equal(lp2.semestre, 3);
    assert.deepEqual(lp2.grupos.map(g => [g.n, g.ht, g.hp, g.th]), [[1, 3, 2, 5], [2, 0, 2, 2]]);
    const sems = r.asignaturas.map(a => a.semestre);
    assert.deepEqual(sems, [...sems].sort((a, b) => a - b));
    assert.deepEqual(r.asignaturas.filter(a => a.semestre === 1).map(a => a.codigo),
      ["3.1.1.24", "3.1.2.24", "3.1.3.24", "3.1.4.24", "3.1.5.24", "3.1.6.24"]);
    assert.equal(asignatura(r, "3.2.1.24").grupos[0].obs, "");
  });

  test("el mismo rango como CSV con \";\" y con \",\" (comillas, separadores y salto de línea en una celda, BOM) da lo mismo", () => {
    const e = entorno();
    const filas = filasHoja("ING").map(f => f.slice());
    filas[3][11] = 'Primera línea\n"Segunda"; con, separadores';
    const esperado = interpretar(e, aTsv(filas), "ING");
    assert.equal(esperado.asignaturas[0].grupos[0].obs, 'Primera línea "Segunda"; con, separadores');
    for (const sep of [";", ","]) {
      const csv = aCsv(filas, sep);
      assert.ok(csv.includes(sep === ";" ? ";;" : ",,"));
      assert.deepEqual(interpretar(e, BOM + csv, "ING"), esperado, "CSV con " + sep);
    }
  });

  test("las 8 hojas del Excel real: 345 asignaturas, 366 grupos y JSON holgado en una celda", () => {
    const e = entorno(TODAS);
    let asignaturas = 0, grupos = 0, mayor = 0;
    const esperado = { ADM: [60, 60], DER: [80, 87], ING: [68, 75], ICO: [45, 45], COM: [38, 38], PSI: [29, 36], ARQ: [12, 12], IND: [13, 13] };
    for (const carrera of Object.keys(HOJAS)) {
      const r = interpretar(e, aTsv(filasHoja(carrera)), carrera);
      assert.deepEqual([r.asignaturas.length, contar(r.asignaturas), r.descartadas], [...esperado[carrera], 0], carrera);
      asignaturas += r.asignaturas.length;
      grupos += contar(r.asignaturas);
      mayor = Math.max(mayor, JSON.stringify({ asignaturas: r.asignaturas }).length);
    }
    /* 366 y no 365: PSI trae dos filas con el código 9.2.5.24 y semestre "2" (dos cursos distintos);
       la especificación pide darle a la repetida el siguiente grupo libre con aviso, no descartarla. */
    assert.deepEqual([asignaturas, grupos], [345, 366]);
    assert.ok(mayor < 25000, "el plan más grande ocupa " + mayor);
    const psi = asignatura(interpretar(e, aTsv(filasHoja("PSI")), "PSI"), "9.2.5.24");
    assert.deepEqual(psi.grupos.map(g => g.n), [1, 2]);
    assert.deepEqual(psi.grupos[1].avisos, ["Nombre distinto al de la primera fila: \"Procesos básicos I\"", "Grupo 1 repetido: se numeró como 2"]);
  });

  test("las filas de otra carrera se descartan y se cuentan; CARRERA vacía o con el nombre cuenta como la elegida", () => {
    const e = entorno();
    const ing = filasHoja("ING"), adm = filasHoja("ADM").slice(3);
    const mezcla = aTsv(ing.concat(adm));
    const r = interpretar(e, mezcla, "ING");
    assert.equal(r.asignaturas.length, 68);
    assert.deepEqual([r.filas, r.descartadas], [135, 60]);
    assert.ok(r.avisos.includes("Se descartaron 60 filas de otra carrera."));
    const a = interpretar(e, mezcla, "ADM");
    assert.deepEqual([a.asignaturas.length, a.descartadas], [60, 75]);
    const pocas = aTsv([["CARRERA", "CODIGO", "ASIGNATURA", "SEMESTRE"], ["", "1", "Uno", "1"], ["Ingeniería de Software", "2", "Dos", "1"], ["IND", "3", "Tres", "1"]]);
    const p = interpretar(e, pocas, "ING");
    assert.deepEqual([p.asignaturas.map(x => x.codigo), p.descartadas], [["1", "2"], 1]);
    assert.ok(p.avisos.includes("Se descartó 1 fila de otra carrera."));
  });

  test("lo que no se entiende se conserva con aviso: semestre, horas, total distinto, sin código, grupo repetido", () => {
    const e = entorno();
    /* Excel copia un rectángulo: la fila del título también lleva sus tabulaciones (rellenar). */
    const rectangulo = filas => filas.map(f => Array.from({ length: 10 }, (_, i) => f[i] || ""));
    const texto = aTsv(rectangulo([
      ["PLAN DE PRUEBA"], [],
      ["Carrera", "Semestre", "CÓDIGO", "Asignatura", "HT", "HP", "TOTAL\nHORAS", "DOCENTE", "Turno", "Observación"],
      ["ING", "3 - 1", "3.1.10.24", "Diez", "2", "2", "5", "Alguien", "Mañana", "  con   espacios  "],
      ["ING", "3", "3.1.2.24", "Dos", "1,5", "dos", "", "", "", ""],
      ["ING", "Optativo", "9.9.9.24", "Electivo", "2", "", "", "", "", ""],
      ["ING", "1", "", "Sin código", "2", "2", "4", "", "", ""],
      ["ING", "1-2", "1.1.1.24", "Repetido", "2", "2", "4", "", "", ""],
      ["ING", "1-2", "1.1.1.24", "Repetido", "2", "2", "4", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["ING", "1", " ", "", "2", "2", "4", "", "", "fila sin código ni asignatura"]
    ]));
    const r = interpretar(e, texto, "ING");
    assert.equal(r.filas, 6);
    assert.deepEqual(r.asignaturas.map(a => [a.semestre, a.codigo]),
      [[1, ""], [1, "1.1.1.24"], [3, "3.1.2.24"], [3, "3.1.10.24"], [null, "9.9.9.24"]]);
    const [sinCodigo, repetido, dos, diez, electivo] = r.asignaturas;
    assert.deepEqual(sinCodigo.grupos[0].avisos, ["Sin código"]);
    assert.deepEqual(repetido.grupos.map(g => [g.n, g.avisos]), [[2, []], [3, ["Grupo 2 repetido: se numeró como 3"]]]);
    assert.deepEqual([dos.grupos[0].ht, dos.grupos[0].hp, dos.grupos[0].th, dos.grupos[0].avisos], [1.5, "dos", "", ["HP no reconocido: \"dos\""]]);
    assert.deepEqual([diez.grupos[0].n, diez.grupos[0].th, diez.grupos[0].obs, diez.grupos[0].avisos], [1, 5, "con espacios", ["TOTAL (5) no es HT + HP (4)"]]);
    assert.deepEqual([electivo.grupos[0].n, electivo.grupos[0].hp, electivo.grupos[0].th, electivo.grupos[0].avisos], [1, 0, 2, ["Semestre no reconocido: \"Optativo\""]]);
    assert.ok(r.avisos.includes("5 filas tienen avisos: revísalas en la previsualización."));
  });

  test("códigos en minúsculas o como propiedades de Object, grupo 0, grupo 100 y comilla sin cerrar", () => {
    const e = entorno();
    const cab = "CARRERA\tSEMESTRE\tCODIGO\tASIGNATURA\tHT\tHP\tTH\tOBSERVACIONES";
    const leer = (...filas) => interpretar(e, [cab, ...filas].join("\n"), "ING").asignaturas;
    const resumen = asignaturas => asignaturas.map(a => [a.codigo, a.grupos.map(g => [g.n, g.avisos])]);
    const raros = leer("ING\t1\tconstructor\tA\t2\t2\t4", "ING\t1\t__proto__\tB\t2\t2\t4", "ING\t1\ttoString\tC\t2\t2\t4");
    assert.deepEqual(raros.map(a => a.codigo).sort(), ["CONSTRUCTOR", "TOSTRING", "__PROTO__"]);
    assert.deepEqual(resumen(leer("ING\t1\tadm101\tCurso\t2\t2\t4", "ING\t1-2\tADM 101\tCurso\t2\t2\t4")), [["ADM101", [[1, []], [2, []]]]]);
    assert.deepEqual(resumen(leer("ING\t4-0\t3.1.1.24\tCurso\t2\t2\t4", "ING\t4-1\t3.1.1.24\tCurso\t2\t2\t4")),
      [["3.1.1.24", [[1, ["Grupo 0 no válido: se numeró como 1"]], [2, ["Grupo 1 repetido: se numeró como 2"]]]]]);
    const cien = leer("ING\t1-99\t3.1.1.24\tCurso\t2\t2\t4", "ING\t1-99\t3.1.1.24\tCurso\t2\t2\t4");
    assert.deepEqual(resumen(cien), [["3.1.1.24", [[99, []], [100, ["Grupo 99 repetido: se numeró como 100"]]]]]);
    datos(e, "planAbrir", CICLO, "ING");
    assert.equal(datos(e, "planGuardar", CICLO, "ING", { asignaturas: cien.concat(raros) }, 0).version, 1, "lo que interpreta, se guarda");
    assert.deepEqual(JSON.parse(planes(e, "ING")[0][5]).asignaturas.map(a => a.codigo).sort(), ["3.1.1.24", "CONSTRUCTOR", "TOSTRING", "__PROTO__"]);

    /* Una comilla de apertura que no se cierra es un carácter más: no se traga las filas de abajo. */
    const tsv = interpretar(e, 'CODIGO\tASIGNATURA\tOBSERVACIONES\n1.1\tCurso\t"Ver nota\n1.2\tCurso2\tok\n1.3\tCurso3\tok', "ING");
    assert.deepEqual(tsv.asignaturas.map(a => [a.codigo, a.grupos[0].obs]), [["1.1", '"Ver nota'], ["1.2", "ok"], ["1.3", "ok"]]);
    const csv = interpretar(e, 'CODIGO;ASIGNATURA;OBSERVACIONES\n1.1;"Curso; ""uno""";"Ver\n1.2;Curso2;ok', "ING");
    assert.deepEqual(csv.asignaturas.map(a => [a.codigo, a.nombre, a.grupos[0].obs]), [["1.1", 'Curso; "uno"', '"Ver'], ["1.2", "Curso2", "ok"]]);
  });

  test("planInterpretar: texto vacío, sin cabeceras, carrera desconocida y cuenta sin rol fallan con mensaje", () => {
    const e = entorno();
    assert.equal(fallo(e, "planInterpretar", "  \n ", "ING"), "Pega el rango o sube un CSV.");
    assert.equal(fallo(e, "planInterpretar", "a\tb\n1\t2", "ING"), "No encontré la fila de cabeceras (CODIGO, ASIGNATURA…).");
    assert.match(fallo(e, "planInterpretar", "CODIGO\tASIGNATURA", "XYZ"), /^Carrera desconocida/);
    e.como("sinrol@ulasalle.edu.pe");
    assert.match(fallo(e, "planInterpretar", "CODIGO\tASIGNATURA", "ING"), /^Acceso denegado: cuenta sin rol/);
  });

  /* ===================== Inicio, permisos y ciclos ===================== */

  test("planInicio: último ciclo por defecto, ciclo desconocido, 8 carreras y permiso por carrera", () => {
    const e = entorno();
    const d = datos(e, "planInicio", "");
    assert.deepEqual([d.ciclo, d.ciclos], ["2026-2", ["2026-1", "2026-2"]]);
    assert.equal(d.carreras.length, 8);
    assert.deepEqual(d.carreras.filter(c => c.puedeEditar).map(c => c.sigla), ["ING"]);
    assert.deepEqual(d.carreras.find(c => c.sigla === "DER"), {
      sigla: "DER", nombre: "Derecho", departamento: "DACJ", version: 0, usuario: "", fecha: "", asignaturas: 0, grupos: 0, editor: "", puedeEditar: false
    });
    assert.equal(fallo(e, "planInicio", "2030-1"), "Ciclo desconocido: \"2030-1\".");
    e.como(DIRECTOR);
    assert.deepEqual(datos(e, "planInicio", CICLO).carreras.filter(c => c.puedeEditar), []);
  });

  test("acceso: sin cuenta, fuera del dominio o sin rol ven \"Acceso denegado\"", () => {
    const e = entorno("");
    assert.match(fallo(e, "planInicio", CICLO), /^Acceso denegado: cuenta no identificada/);
    e.como("alguien@gmail.com");
    assert.match(fallo(e, "planAbrir", CICLO, "ING"), /^Acceso denegado: cuenta fuera del dominio/);
    e.como("sinrol@ulasalle.edu.pe");
    assert.match(fallo(e, "planHistorial", CICLO, "ING"), /^Acceso denegado: cuenta sin rol/);
  });

  test("permisos: el director y el coordinador de otra carrera abren en lectura y no guardan ni restauran", () => {
    const e = entorno(TODAS);
    guardarReal(e, "ING");
    for (const usuario of [DIRECTOR, "coord.adm@ulasalle.edu.pe"]) {
      e.como(usuario);
      const d = datos(e, "planAbrir", CICLO, "ING");
      assert.deepEqual([d.modo, d.motivo, d.editor, d.version], ["lectura", "Solo lectura: no es una de tus carreras", "", 1]);
      assert.equal(d.plan.asignaturas.length, 68);
      assert.match(fallo(e, "planGuardar", CICLO, "ING", d.plan, 1), /^No puedes editar el plan de ING/);
      assert.match(fallo(e, "planRestaurar", CICLO, "ING", 1), /^No puedes restaurar/);
    }
    assert.deepEqual(bloqueos(e), []);
    assert.match(fallo(e, "planAbrir", CICLO, "XYZ"), /^Carrera desconocida/);
  });

  /* ===================== Guardado, versiones y bloqueo ===================== */

  test("guardado con versionado: cada guardado añade una versión, libera el bloqueo y no cambia las anteriores", () => {
    const e = entorno();
    const a = datos(e, "planAbrir", CICLO, "ING");
    assert.deepEqual([a.modo, a.motivo, a.editor, a.version, a.plan], ["edicion", "", COORD, 0, { asignaturas: [] }]);
    assert.match(a.vence, ISO_PERU);
    assert.ok(Math.abs(Date.parse(a.vence) - Date.now() - 30 * MIN) < 5000);
    assert.deepEqual(bloqueos(e), [["plan", CICLO, "ING", COORD, a.vence]]);
    assert.equal(datos(e, "planInicio", CICLO).carreras.find(c => c.sigla === "ING").editor, COORD);

    const plan = planReal(e, "ING");
    const g1 = datos(e, "planGuardar", CICLO, "ING", plan, 0);
    assert.equal(g1.version, 1);
    assert.match(g1.fecha, ISO_PERU);
    assert.deepEqual(g1.avisos, []);
    assert.deepEqual(bloqueos(e), []);
    const fila1 = planes(e, "ING")[0].slice();
    assert.deepEqual(fila1.slice(0, 5), [CICLO, "ING", "1", COORD, g1.fecha]);
    assert.deepEqual(JSON.parse(fila1[5]), plan);

    const b = datos(e, "planAbrir", CICLO, "ING");
    assert.deepEqual([b.version, b.usuario, b.fecha], [1, COORD, g1.fecha]);
    assert.deepEqual(b.plan, plan);
    b.plan.asignaturas[0].grupos.push({ n: 3, ht: 2, hp: 4, th: 6, obs: "", avisos: [], desdoble: null, fusion: null });
    assert.equal(datos(e, "planGuardar", CICLO, "ING", b.plan, 1).version, 2);
    assert.deepEqual(planes(e, "ING").map(f => f[2]), ["1", "2"]);
    assert.deepEqual(planes(e, "ING")[0], fila1);
    const ing = datos(e, "planInicio", CICLO).carreras.find(c => c.sigla === "ING");
    assert.deepEqual([ing.version, ing.usuario, ing.asignaturas, ing.grupos, ing.editor], [2, COORD, 68, 76, ""]);
    assert.equal(fallo(e, "planGuardar", CICLO, "ING", b.plan, 2), SIN_BLOQUEO, "tras guardar ya no hay bloqueo");
  });

  test("conflicto de versión: si la vigente no es la base, no guarda y conserva el bloqueo", () => {
    const e = entorno();
    datos(e, "planAbrir", CICLO, "ING");
    const plan = planReal(e, "ING");
    datos(e, "planGuardar", CICLO, "ING", plan, 0);
    datos(e, "planAbrir", CICLO, "ING");
    e.hojas.Planes.datos.push([CICLO, "ING", "2", "otra@ulasalle.edu.pe", "2026-10-15T11:01:11-05:00", JSON.stringify(plan)]);
    assert.equal(fallo(e, "planGuardar", CICLO, "ING", plan, 1),
      "Hay una versión más nueva (v2, guardada por otra@ulasalle.edu.pe el 2026-10-15 11:01). Sal y vuelve a abrir para ver los cambios.");
    assert.equal(bloqueos(e).length, 1);
    assert.equal(planes(e, "ING").length, 2);
    assert.equal(datos(e, "planGuardar", CICLO, "ING", plan, 2).version, 3);
  });

  test("bloqueo de otra cuenta: la ve \"En edición por …\", en lectura, y no puede guardar, mantener, soltar ni restaurar", () => {
    const e = entorno();
    guardarReal(e, "ING", COORD);
    e.como(COORD);
    datos(e, "planAbrir", CICLO, "ING");
    e.como(COORD2);
    const d = datos(e, "planAbrir", CICLO, "ING");
    assert.deepEqual([d.modo, d.motivo, d.editor], ["lectura", "En edición por " + COORD, COORD]);
    assert.equal(datos(e, "planInicio", CICLO).carreras.find(c => c.sigla === "ING").editor, COORD);
    assert.equal(fallo(e, "planGuardar", CICLO, "ING", d.plan, 1), SIN_BLOQUEO);
    assert.equal(fallo(e, "planMantener", CICLO, "ING"), SIN_BLOQUEO);
    assert.deepEqual(datos(e, "planSalir", CICLO, "ING"), {});
    assert.equal(bloqueos(e)[0][3], COORD);
    assert.equal(fallo(e, "planRestaurar", CICLO, "ING", 1), "No se puede restaurar: " + COORD + " está editando este plan.");
  });

  test("bloqueo vencido a los 31 minutos: no se mantiene ni guarda, y otra cuenta lo toma", () => {
    const e = entorno();
    const a = datos(e, "planAbrir", CICLO, "ING");
    e.avanzar(31 * MIN);
    assert.equal(fallo(e, "planMantener", CICLO, "ING"), SIN_BLOQUEO);
    e.como(COORD2);
    const b = datos(e, "planAbrir", CICLO, "ING");
    assert.deepEqual([b.modo, b.editor], ["edicion", COORD2]);
    assert.equal(bloqueos(e).length, 1);
    e.como(COORD);
    assert.equal(fallo(e, "planGuardar", CICLO, "ING", planReal(e, "ING"), a.version), SIN_BLOQUEO);
    e.como(COORD2);
    assert.equal(datos(e, "planGuardar", CICLO, "ING", planReal(e, "ING"), 0).version, 1);
  });

  test("mantener renueva el bloqueo 30 minutos desde ahora y salir lo suelta", () => {
    const e = entorno();
    const a = datos(e, "planAbrir", CICLO, "ING");
    e.avanzar(20 * MIN);
    const m = datos(e, "planMantener", CICLO, "ING");
    assert.match(m.vence, ISO_PERU);
    assert.equal(Date.parse(m.vence) - Date.parse(a.vence), 20 * MIN);
    e.avanzar(20 * MIN);
    assert.equal(datos(e, "planMantener", CICLO, "ING").vence, bloqueos(e)[0][4]);
    assert.deepEqual(datos(e, "planSalir", CICLO, "ING"), {});
    assert.deepEqual(bloqueos(e), []);
    e.como(COORD2);
    assert.equal(datos(e, "planAbrir", CICLO, "ING").modo, "edicion");
  });

  test("historial, ver una versión y restaurar (sin bloqueo y con el bloqueo propio, que se conserva)", () => {
    const e = entorno();
    guardarReal(e, "ING", COORD);
    guardarReal(e, "ING", COORD, p => { p.asignaturas.pop(); });
    const h = datos(e, "planHistorial", CICLO, "ING").versiones;
    assert.deepEqual(h.map(v => [v.version, v.usuario, v.resumen]), [[2, COORD, "67 asignaturas, 74 grupos"], [1, COORD, "68 asignaturas, 75 grupos"]]);
    assert.match(h[0].fecha, ISO_PERU);
    const v1 = datos(e, "planVersion", CICLO, "ING", 1);
    assert.deepEqual([v1.modo, v1.motivo, v1.version, v1.carrera, v1.nombre], ["lectura", "Versión 1 · solo lectura", 1, "ING", "Ingeniería de Software"]);
    assert.equal(v1.plan.asignaturas.length, 68);
    assert.equal(fallo(e, "planVersion", CICLO, "ING", 9), "No existe la versión 9 del plan de ING en " + CICLO + ".");

    assert.deepEqual(datos(e, "planRestaurar", CICLO, "ING", 1), { version: 3 });
    const v3 = JSON.parse(planes(e, "ING")[2][5]);
    assert.deepEqual(v3, Object.assign({}, v1.plan, { restauradaDe: 1 }));
    assert.equal(datos(e, "planHistorial", CICLO, "ING").versiones[0].resumen, "68 asignaturas, 75 grupos · restaura v1");

    const a = datos(e, "planAbrir", CICLO, "ING");
    assert.deepEqual([a.version, a.modo], [3, "edicion"]);
    assert.deepEqual(datos(e, "planRestaurar", CICLO, "ING", 2), { version: 4 });
    assert.equal(bloqueos(e)[0][3], COORD, "quien restaura conserva su bloqueo");
    const guardado = datos(e, "planGuardar", CICLO, "ING", datos(e, "planVersion", CICLO, "ING", 4).plan, 4);
    assert.equal(guardado.version, 5);
    assert.equal(JSON.parse(planes(e, "ING")[4][5]).restauradaDe, undefined, "un guardado normal no es una restauración");
  });

  /* ===================== Saneamiento ===================== */

  test("planGuardar sanea: solo campos del modelo, textos recortados, sin fusionExterna ni restauradaDe", () => {
    const e = entorno();
    datos(e, "planAbrir", CICLO, "ING");
    const contenido = {
      restauradaDe: 3, extra: "x",
      asignaturas: [{
        codigo: " 3.1.1.24 ", nombre: "N".repeat(250), malla: "2024", semestre: "1", dpto: "DIMA", raro: true,
        grupos: [{ n: 1, ht: 2, hp: 4, th: 6, obs: "O".repeat(400), avisos: ["Sin código", 5], desdoble: { componente: "P", n: 2, x: 1 }, fusion: null,
                   fusionExterna: { carrera: "ADM" }, otro: 1 },
                 { n: 2, ht: -1, hp: "dos", th: { a: 1 }, desdoble: null, fusion: null }]
      }]
    };
    datos(e, "planGuardar", CICLO, "ING", contenido, 0);
    const guardado = JSON.parse(planes(e, "ING")[0][5]);
    assert.deepEqual(Object.keys(guardado), ["asignaturas"]);
    const a = guardado.asignaturas[0];
    assert.deepEqual(Object.keys(a), ["codigo", "nombre", "malla", "semestre", "dpto", "grupos"]);
    assert.deepEqual([a.codigo, a.nombre.length, a.semestre], ["3.1.1.24", 200, null]);
    assert.deepEqual(a.grupos[0], { n: 1, ht: 2, hp: 4, th: 6, obs: "O".repeat(300), avisos: ["Sin código", "5"], desdoble: { componente: "P", n: 2 }, fusion: null });
    assert.deepEqual(a.grupos[1], { n: 2, ht: "-1", hp: "dos", th: "[object Object]", obs: "", avisos: [], desdoble: null, fusion: null });
  });

  test("planGuardar rechaza con mensaje, sin escribir: desdoble, grupos, límites y tamaño de celda", () => {
    const e = entorno();
    datos(e, "planAbrir", CICLO, "ING");
    const grupo = (n, extra) => Object.assign({ n, ht: 2, hp: 0, th: 2, obs: "", avisos: [], desdoble: null, fusion: null }, extra);
    const plan = (...grupos) => ({ asignaturas: [{ codigo: "3.1.1.24", nombre: "Uno", malla: "2024", semestre: 1, dpto: "DIMA", grupos }] });
    const casos = [
      [plan(grupo(1, { desdoble: { componente: "P", n: 2 } })), /^Desdoble no válido en 3\.1\.1\.24 grupo 1/],
      [plan(grupo(1, { desdoble: { componente: "T", n: 10 } })), /^Desdoble no válido en 3\.1\.1\.24 grupo 1/],
      [plan(grupo(1, { desdoble: { componente: "X", n: 2 } })), /^Desdoble no válido/],
      [plan(grupo(1), grupo(1)), /^Número de grupo no válido o repetido en 3\.1\.1\.24: 1/],
      [plan(grupo("1")), /^Número de grupo no válido/],
      [plan(), /debe tener entre 1 y 30 grupos/],
      [plan(...Array.from({ length: 31 }, (_, i) => grupo(i + 1))), /debe tener entre 1 y 30 grupos/],
      [{ asignaturas: "nada" }, /^El plan no tiene el formato esperado/],
      [null, /^El plan no tiene el formato esperado/],
      [{ asignaturas: Array.from({ length: 401 }, (_, i) => ({ codigo: "C" + i, nombre: "x", grupos: [grupo(1)] })) }, /el máximo es 400/],
      [{ asignaturas: [plan(grupo(1)).asignaturas[0], plan(grupo(1)).asignaturas[0]] }, /^Código repetido en el plan: 3\.1\.1\.24/],
      [{ asignaturas: [{ codigo: "adm101", grupos: [grupo(1)] }, { codigo: "ADM 101", grupos: [grupo(1)] }] }, /^Código repetido en el plan: ADM101\./],
      [{ asignaturas: Array.from({ length: 400 }, (_, i) => ({ codigo: "C" + i, nombre: "N".repeat(200), grupos: [grupo(1, { obs: "O".repeat(300) })] })) },
        /una celda admite 50000/]
    ];
    for (const [contenido, mensaje] of casos) assert.match(fallo(e, "planGuardar", CICLO, "ING", contenido, 0), mensaje);
    assert.equal(planes(e, "ING").length, 0);
    assert.equal(bloqueos(e).length, 1, "el bloqueo sigue");
    assert.equal(datos(e, "planGuardar", CICLO, "ING", plan(grupo(1, { ht: 2, desdoble: { componente: "T", n: 3 } })), 0).version, 1);
  });

  test("planGuardar valida las fusiones: miembros, principal y grupos locales que la llevan", () => {
    const e = entorno();
    datos(e, "planAbrir", CICLO, "ING");
    const m = (carrera, codigo, grupo) => ({ carrera, codigo, grupo, nombre: "X", ht: 2, hp: 2, th: 4 });
    const fusion = (miembros, principal = miembros[0]) => ({ id: "F1", principal: { carrera: principal.carrera, codigo: principal.codigo, grupo: principal.grupo }, miembros });
    const plan = (f1, f2 = null) => ({
      asignaturas: [
        { codigo: "3.2.1.24", nombre: "A", semestre: 2, grupos: [{ n: 1, ht: 2, hp: 2, th: 4, fusion: f1 }] },
        { codigo: "3.6.1.24", nombre: "B", semestre: 6, grupos: [{ n: 1, ht: 2, hp: 2, th: 4, fusion: f2 }] }
      ]
    });
    const a = m("ING", "3.2.1.24", 1), b = m("ING", "3.6.1.24", 1), adm = m("ADM", "1.1.1.24", 1);
    const casos = [
      [plan(fusion([a])), /^Fusión F1 \(3\.2\.1\.24 grupo 1\): necesita al menos 2 grupos/],
      [plan(fusion([a, adm]), Object.assign(fusion([b, adm]), { id: "F2" })), /^ADM 1\.1\.1\.24-1 está en dos fusiones: F1 y F2\.$/],
      [plan(fusion([a, adm], b)), /el grupo principal no está entre sus miembros/],
      [plan(fusion([a, a])), /está repetido/],
      [plan(fusion([a, m("XYZ", "1", 1)])), /cada grupo necesita carrera, código y número válidos/],
      [plan(Object.assign(fusion([a, adm]), { id: "X1" })), /el identificador no es válido/],
      [plan(fusion([a, b])), /^La fusión F1 incluye 3\.6\.1\.24 grupo 1, que no está en el plan o no lleva esa fusión/],
      [plan(fusion([a, m("ING", "3.9.9.24", 1)])), /^La fusión F1 incluye 3\.9\.9\.24 grupo 1/],
      [plan(fusion([b, adm])), /^El grupo 1 de 3\.2\.1\.24 lleva la fusión F1 pero no está entre sus miembros/],
      [plan(fusion([a, b]), fusion([a, b, adm])), /^La fusión F1 no es igual en todos sus grupos/]
    ];
    for (const [contenido, mensaje] of casos) assert.match(fallo(e, "planGuardar", CICLO, "ING", contenido, 0), mensaje);
    assert.equal(planes(e, "ING").length, 0);
    const g = datos(e, "planGuardar", CICLO, "ING", plan(fusion([a, b]), fusion([a, b])), 0);
    assert.deepEqual(g.avisos, []);
    assert.deepEqual(JSON.parse(planes(e, "ING")[0][5]).asignaturas[1].grupos[0].fusion, fusion([a, b]));
    /* Sin tope de miembros: una fusión de 21 grupos se guarda (los de ADM no existen: solo avisa). */
    datos(e, "planAbrir", CICLO, "ING");
    const grande = fusion([a, ...Array.from({ length: 20 }, (_, i) => m("ADM", "1.1." + (i + 1) + ".24", 1))]);
    assert.equal(datos(e, "planGuardar", CICLO, "ING", plan(grande), 1).avisos.length, 20);
  });

  /* ===================== Operaciones de la vista ===================== */

  /** Vista con el plan real de ING abierto en edición por COORD. */
  async function vistaEnEdicion(e) {
    const v = vista(e);
    await v.c.inicio();
    await v.c.abrir("ING");
    v.c.texto = aTsv(filasHoja("ING"));
    await v.c.interpretar();
    return v;
  }

  test("agregar y quitar grupo: n correlativo, horas del grupo de menor n y nunca el último grupo", async () => {
    const { c, confirmaciones } = await vistaEnEdicion(entorno());
    const lp2 = c.plan.asignaturas.find(a => a.codigo === "3.3.1.24");
    lp2.grupos[0].desdoble = { componente: "P", n: 2 };
    assert.equal(c.agregarGrupo(lp2), 3);
    assert.deepEqual(plano(lp2.grupos[2]), { n: 3, ht: 3, hp: 2, th: 5, obs: "", avisos: [], desdoble: null, fusion: null });
    assert.equal(c.cambios, true);
    assert.equal(c.quitarGrupo(lp2, lp2.grupos[1]), true);
    assert.deepEqual(lp2.grupos.map(g => g.n), [1, 3], "los números no se renumeran");
    assert.equal(c.agregarGrupo(lp2), 4);
    const uno = c.plan.asignaturas.find(a => a.codigo === "3.2.1.24");
    assert.equal(c.quitarGrupo(uno, uno.grupos[0]), false);
    assert.equal(uno.grupos.length, 1);
    c.uiQuitarGrupo(lp2, lp2.grupos[0]);
    assert.match(confirmaciones.at(-1), /^¿Quitar el grupo 1 de 3\.3\.1\.24 Lenguaje de Programación II\?$/);
    assert.deepEqual(lp2.grupos.map(g => g.n), [3, 4]);
  });

  test("desdoble: valida HP > 0 / HT > 0 y de 2 a 9 subgrupos; se puede quitar", async () => {
    const { c } = await vistaEnEdicion(entorno());
    const sinPractica = c.plan.asignaturas.find(a => a.grupos[0].hp === 0).grupos[0];
    assert.equal(c.desdoblar(sinPractica, "P", 2), false);
    assert.match(c.error, /necesita HP mayor que 0/);
    assert.equal(sinPractica.desdoble, null);
    const g = c.plan.asignaturas[0].grupos[0];
    assert.equal(c.desdoblar(g, "T", 10), false);
    assert.equal(c.desdoblar(g, "T", 1), false);
    assert.equal(c.desdoblar(g, "X", 2), false);
    assert.equal(g.desdoble, null);
    assert.equal(c.desdoblar(g, "P", 3), true);
    assert.deepEqual(plano(g.desdoble), { componente: "P", n: 3 });
    assert.equal(c.error, "");
    c.abrirDesdoble(c.plan.asignaturas[0], c.plan.asignaturas[0].grupos[1]);
    c.desdobleDe.componente = "T";
    c.desdobleDe.n = "4";
    c.aplicarDesdoble();
    assert.deepEqual([plano(c.plan.asignaturas[0].grupos[1].desdoble), c.desdobleDe], [{ componente: "T", n: 4 }, null]);
    c.quitarDesdoble(g);
    assert.equal(g.desdoble, null);
  });

  test("fusión en la misma carrera: id nuevo, mismo objeto en los grupos, advertencias, quitar grupo y deshacer", async () => {
    const e = entorno();
    const { c, confirmaciones } = await vistaEnEdicion(e);
    const ref = (codigo, grupo) => ({ carrera: "ING", codigo, grupo });   /* en ING, del semestre 6 en adelante los códigos son de la malla 2021 (.21) */
    const adv = c.fusionar([ref("3.2.1.24", 1), ref("3.6.1.21", 1)], ref("3.2.1.24", 1));
    const a = c.buscarGrupo("3.2.1.24", 1).g, b = c.buscarGrupo("3.6.1.21", 1).g;
    assert.equal(a.fusion.id, "F1");
    assert.deepEqual(plano(a.fusion), plano(b.fusion));
    assert.deepEqual(plano(a.fusion.principal), ref("3.2.1.24", 1));
    assert.equal(a.fusion.miembros.length, 2);
    assert.ok(plano(adv).length === 1 && /^ING 3\.6\.1\.21-1: .*otro código/.test(adv[0]));
    assert.equal(c.textoFusion(c.buscarGrupo("3.6.1.21", 1).a, b), "FUS con ING 3.2.1.24-1 (principal)");
    assert.equal(c.textoFusion(c.buscarGrupo("3.2.1.24", 1).a, a), "FUS principal · con ING 3.6.1.21-1");

    assert.equal(c.fusionar([ref("3.2.1.24", 1), ref("3.7.1.21", 1)], ref("3.7.1.21", 1)), null, "ya fusionado");
    assert.match(c.error, /ya está fusionado/);
    assert.equal(c.fusionar([ref("3.7.1.21", 1)], ref("3.7.1.21", 1)), null);
    assert.equal(c.error, "Elige al menos dos grupos.");
    assert.equal(c.fusionar([ref("3.7.1.21", 1), ref("3.8.1.21", 1)], ref("3.9.1.21", 1)), null);
    assert.equal(c.error, "Elige el grupo principal entre los elegidos.");
    assert.equal(plano(c.fusionar([ref("3.7.1.21", 1), ref("3.8.1.21", 1)], ref("3.8.1.21", 1))).length, 1);
    assert.equal(c.buscarGrupo("3.7.1.21", 1).g.fusion.id, "F2");

    const lp2 = c.plan.asignaturas.find(x => x.codigo === "3.3.1.24");
    c.fusionar([ref("3.3.1.24", 2), ref("3.4.1.24", 1)], ref("3.4.1.24", 1));
    c.uiQuitarGrupo(lp2, lp2.grupos[1]);
    assert.match(confirmaciones.at(-1), /Está en una fusión: se deshará\.$/);
    assert.equal(c.buscarGrupo("3.4.1.24", 1).g.fusion, null);

    c.deshacerFusion("F1");
    assert.deepEqual([a.fusion, b.fusion], [null, null]);
    await c.guardar();
    assert.equal(c.exito, "Guardado como v1.");
    const guardado = JSON.parse(planes(e, "ING")[0][5]);
    assert.equal(asignatura(guardado, "3.8.1.21").grupos[0].fusion.id, "F2");
  });

  test("fusión con otra carrera: candidatos, marca fusionExterna en la otra, avisos al guardar y deshacer", async () => {
    const e = entorno(TODAS);
    guardarReal(e, "ADM");
    guardarReal(e, "ICO");
    e.como(TODAS);
    const { c } = vista(e);
    c.ciclo = CICLO;   /* los planes se guardaron en CICLO; sin elegirlo, la vista abre el último (2026-2) */
    await c.inicio();
    await c.abrir("ADM");
    assert.equal(c.doc.modo, "edicion");
    const candidatos = datos(e, "planCandidatosFusion", CICLO, "ADM").candidatos;
    assert.equal(candidatos.length, 45);
    assert.ok(candidatos.every(x => x.carrera === "ICO" && x.fusionadoEn === ""));
    const ico = candidatos.find(x => x.codigo === "7.1.1.24");
    assert.deepEqual(ico, { carrera: "ICO", codigo: "7.1.1.24", nombre: "Comunicación I", semestre: 1, grupo: 1, ht: 2, hp: 2, th: 4, fusionadoEn: "" });
    const propio = { carrera: "ADM", codigo: "1.1.1.24", grupo: 1 };
    assert.deepEqual(plano(c.fusionar([propio, ico], propio)), ["ICO 7.1.1.24-1: otro código."]);
    assert.equal(c.fusionar([ico, Object.assign({}, ico, { codigo: "7.1.2.24" })], ico), null);
    assert.equal(c.error, "ICO 7.1.1.24-1 ya está fusionado.", "un externo ya usado en este plan no se repite");
    const g = await c.guardar();
    assert.equal(g, undefined);
    assert.deepEqual([c.exito, plano(c.avisos)], ["Guardado como v2.", []]);

    const abierto = datos(e, "planAbrir", CICLO, "ICO");
    const marcado = asignatura(abierto.plan, "7.1.1.24").grupos[0];
    assert.deepEqual(marcado.fusionExterna, {
      carrera: "ADM", id: "F1", principal: propio,
      miembros: [Object.assign({}, propio, { nombre: "Comunicación I", ht: 2, hp: 2, th: 4 }), { carrera: "ICO", codigo: "7.1.1.24", grupo: 1, nombre: "Comunicación I", ht: 2, hp: 2, th: 4 }]
    });
    assert.equal(asignatura(abierto.plan, "7.1.2.24").grupos[0].fusionExterna, undefined);
    assert.equal(datos(e, "planVersion", CICLO, "ICO", 1).plan.asignaturas[0].grupos[0].fusionExterna, undefined);
    assert.equal(datos(e, "planCandidatosFusion", CICLO, "ICO").candidatos.find(x => x.codigo === "1.1.1.24").fusionadoEn, "ADM");
    const paraCom = datos(e, "planCandidatosFusion", CICLO, "COM").candidatos;
    assert.equal(paraCom.find(x => x.carrera === "ICO" && x.codigo === "7.1.1.24").fusionadoEn, "ADM");

    const enIco = vista(e).c;
    enIco.doc = abierto;
    enIco.plan = abierto.plan;
    assert.equal(enIco.fusionar([{ carrera: "ICO", codigo: "7.1.1.24", grupo: 1 }, { carrera: "ICO", codigo: "7.1.2.24", grupo: 1 }], { carrera: "ICO", codigo: "7.1.2.24", grupo: 1 }), null);
    assert.match(enIco.error, /^El grupo 7\.1\.1\.24-1 no existe o ya está fusionado/);
    const adm = datos(e, "planCandidatosFusion", CICLO, "ICO").candidatos.find(x => x.codigo === "1.1.1.24");
    assert.equal(enIco.fusionar([{ carrera: "ICO", codigo: "7.1.2.24", grupo: 1 }, adm], adm), null);
    assert.equal(enIco.error, "ADM 1.1.1.24-1 ya está fusionado.");
    enIco.texto = aTsv(filasHoja("ICO"));
    await enIco.interpretar();
    assert.equal(asignatura(enIco.plan, "7.1.1.24").grupos[0].fusionExterna.carrera, "ADM", "volver a pegar conserva la marca");
    datos(e, "planSalir", CICLO, "ICO");

    /* COM fusiona por su cuenta un grupo que ya está en la fusión de ADM y otro que no existe: avisa, no bloquea. */
    e.como(TODAS);
    datos(e, "planAbrir", CICLO, "COM");
    const plan = planReal(e, "COM");
    const com = { carrera: "COM", codigo: "8.1.1.24", grupo: 1, nombre: "Comunicación I", ht: 2, hp: 2, th: 4 };
    const fusion = { id: "F1", principal: { carrera: "COM", codigo: "8.1.1.24", grupo: 1 },
      miembros: [com, Object.assign({}, com, { carrera: "ICO", codigo: "7.1.1.24" }), Object.assign({}, com, { carrera: "ICO", codigo: "7.1.99.24" })] };
    asignatura(plan, "8.1.1.24").grupos[0].fusion = fusion;
    assert.deepEqual(datos(e, "planGuardar", CICLO, "COM", plan, 0).avisos,
      ["ICO 7.1.1.24-1 ya está en una fusión de ADM.", "ICO 7.1.99.24-1 ya no existe en el plan vigente de ICO."]);

    await c.abrir("ADM");
    c.deshacerFusion(asignatura(c.plan, "1.1.1.24").grupos[0].fusion.id);
    await c.guardar();
    assert.equal(c.exito, "Guardado como v3.");
    assert.equal(asignatura(datos(e, "planAbrir", CICLO, "ICO").plan, "7.1.1.24").grupos[0].fusionExterna.carrera, "COM",
      "deshecha en ADM, queda la de COM");
  });

  test("diálogo de fusión: opciones locales y externas, bloqueadas en gris, filtro, advertencias y aplicar", async () => {
    const e = entorno(TODAS);
    guardarReal(e, "ICO");
    e.como(TODAS);
    const { c, confirmaciones } = vista(e);
    c.ciclo = CICLO;   /* el plan de ICO está en CICLO, no en el último ciclo */
    await c.inicio();
    await c.abrir("ADM");
    c.texto = aTsv(filasHoja("ADM"));
    await c.interpretar();
    const asig = asignatura(c.plan, "1.1.1.24");
    c.abrirFusion(asig, asig.grupos[0]);
    const p = c.candidatosFusion();
    assert.equal(c.ocupado, "candidatos");
    await p;
    assert.equal(c.ocupado, "");
    assert.equal(c.opcionesFusion(true).length, 60 + 45);
    c.fusionDe.filtro = "comunicacion";
    assert.deepEqual(plano(c.opcionesFusion(false).map(o => o.clave)), ["ADM|1.1.1.24|1", "ADM|1.2.1.24|1", "ICO|7.1.1.24|1"], "Comunicación I y II");
    c.fusionDe.filtro = "7.1.1";
    assert.deepEqual(plano(c.opcionesFusion(false).map(o => o.clave)), ["ADM|1.1.1.24|1", "ICO|7.1.1.24|1"], "el marcado se ve aunque no coincida");
    c.fusionDe.marcados.push("ICO|7.1.1.24|1");
    assert.deepEqual(plano(c.advertenciasDialogo()), ["ICO 7.1.1.24-1: otro código."]);
    c.aplicarFusion();
    assert.match(confirmaciones.at(-1), /^Los grupos no coinciden en todo:\nICO 7\.1\.1\.24-1: otro código\.\n¿Fusionar de todos modos\?$/);
    assert.equal(c.fusionDe, null);
    assert.equal(asig.grupos[0].fusion.miembros.length, 2);
    c.abrirFusion(asignatura(c.plan, "1.1.2.24"), asignatura(c.plan, "1.1.2.24").grupos[0]);
    c.fusionDe.externos = datos(e, "planCandidatosFusion", CICLO, "ADM").candidatos;
    const bloqueadas = plano(c.opcionesFusion(true).filter(o => o.bloqueo).map(o => [o.clave, o.bloqueo]));
    assert.deepEqual(bloqueadas, [["ADM|1.1.1.24|1", "en la fusión F1"], ["ICO|7.1.1.24|1", "en una fusión de este plan"]]);
    /* Los grupos sin código no se pueden fusionar: no se listan (y no repiten la clave del x-for). */
    const taller = nombre => ({ codigo: "", nombre, malla: "", semestre: 1, dpto: "", grupos: [{ n: 1, ht: 2, hp: 0, th: 2, obs: "", avisos: [], desdoble: null, fusion: null }] });
    c.plan.asignaturas.push(taller("Taller A"), taller("Taller B"));
    const claves = plano(c.opcionesFusion(true).map(o => o.clave));
    assert.deepEqual([claves.length, new Set(claves).size, claves.filter(k => k.startsWith("ADM||"))], [105, 105, []]);
  });

  /* ===================== Flujo de la vista con el servidor ===================== */

  test("la vista: ocupado durante cada llamada y vuelta a \"\" al terminar, también si falla", async () => {
    const e = entorno();
    const { c, ctx, confirmaciones } = vista(e);
    let p = c.inicio();
    assert.equal(c.ocupado, "inicio");
    await p;
    assert.deepEqual([c.ocupado, c.ciclo, c.carreras.length, c.listo], ["", "2026-2", 8, true]);
    c.ciclo = CICLO;
    p = c.abrir("ING");
    assert.equal(c.ocupado, "abrir ING");
    await p;
    assert.deepEqual([c.ocupado, c.pantalla, c.doc.modo, c.editable], ["", "plan", "edicion", true]);

    c.texto = "   ";
    p = c.interpretar();
    assert.equal(c.ocupado, "interpretar");
    await p;
    assert.deepEqual([c.ocupado, c.error], ["", "Pega el rango o sube un CSV."]);
    c.texto = aTsv(filasHoja("ING"));
    await c.interpretar();
    assert.deepEqual([c.error, c.plan.asignaturas.length, c.lectura.filas, c.cambios, confirmaciones.length], ["", 68, 75, true, 0]);
    assert.equal(c.totales, "68 asignaturas, 75 grupos");
    assert.equal(c.semestres[0].titulo, "Semestre 1 · 6 asignaturas, 12 grupos");
    assert.equal(c.semestres.length, 10);

    ctx.respuesta = false;
    c.texto = aTsv(filasHoja("ING").slice(0, 5));
    await c.interpretar();
    assert.equal(confirmaciones.at(-1), "Esto reemplaza todo el plan, fusiones incluidas. ¿Continuar?");
    assert.equal(c.plan.asignaturas.length, 68, "si no confirma, no reemplaza");
    ctx.respuesta = true;

    p = c.guardar();
    assert.equal(c.ocupado, "guardar");
    await p;
    assert.deepEqual([c.ocupado, c.pantalla, c.exito, c.error], ["", "tabla", "Guardado como v1.", ""]);
    assert.equal(c.carreras.find(x => x.sigla === "ING").version, 1);

    await c.abrir("ING");
    p = c.historial();
    assert.equal(c.ocupado, "historial");
    await p;
    assert.deepEqual([c.verHistorial, c.versiones.length, c.puedeEditarActual], [true, 1, true]);
    await c.version(1);
    assert.deepEqual([c.vistaVersion.motivo, c.editable, c.mostrado.asignaturas.length], ["Versión 1 · solo lectura", false, 68]);
    c.vistaVersion = null;
    p = c.restaurar(1);
    assert.equal(c.ocupado, "restaurar 1");
    await p;
    assert.deepEqual([c.exito, c.doc.version, c.doc.modo], ["Restaurada la v1 como v2.", 2, "edicion"]);
    c.cambios = true;
    ctx.respuesta = false;
    await c.salir();
    assert.equal(c.pantalla, "plan", "no sale si no confirma");
    ctx.respuesta = true;
    p = c.salir();
    assert.equal(c.ocupado, "salir");
    await p;
    assert.deepEqual([c.ocupado, c.pantalla, bloqueos(e).length], ["", "tabla", 0]);
  });

  test("la vista sale de la edición si el bloqueo se perdió (mantener o guardar) y solo mantiene si hubo actividad", async () => {
    const e = entorno();
    const { c } = vista(e);
    c.ciclo = CICLO;
    await c.abrir("ING");
    const vence = c.doc.vence;
    c.latido();
    assert.equal(c.ocupado, "", "sin actividad no llama a planMantener");
    c.agregarGrupo({ grupos: [{ n: 1, ht: 1, hp: 1, th: 2 }] });
    c.error = "Hay una versión más nueva (v3…).";
    e.avanzar(5 * MIN);
    c.latido();
    assert.equal(c.ocupado, "mantener");
    await new Promise(r => setTimeout(r, 5));
    assert.equal(Date.parse(c.doc.vence) - Date.parse(vence), 5 * MIN);
    assert.deepEqual([c.actividad, c.error], [false, "Hay una versión más nueva (v3…)."], "el latido no borra el error ni cuenta como actividad");

    e.avanzar(31 * MIN);
    e.como(COORD2);
    datos(e, "planAbrir", CICLO, "ING");
    e.como(COORD);
    await c.mantener();
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual([c.pantalla, c.error], ["tabla", SIN_BLOQUEO]);

    e.como(COORD2);
    datos(e, "planSalir", CICLO, "ING");
    e.como(COORD);
    await c.abrir("ING");
    e.avanzar(31 * MIN);
    await c.guardar();
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual([c.pantalla, c.error], ["tabla", SIN_BLOQUEO]);
  });

  test("leer archivo: solo .csv; UTF-8 o, si no lo es, Windows-1252 (CSV de Excel en ANSI)", async () => {
    const e = entorno();
    const { c } = vista(e);
    c.ciclo = CICLO;
    await c.abrir("ING");
    const evento = (name, buf) => ({ target: { value: "C:\\fakepath\\" + name, files: [{ name, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) }] } });
    await c.leerArchivo(evento("plan.xlsx", Buffer.from("x")));
    assert.equal(c.error, "Solo se aceptan archivos .csv; para .xlsx copia el rango y pégalo.");
    const csv = aCsv(filasHoja("ING"), ";");
    const ev = evento("Plan.CSV", Buffer.from(csv, "latin1"));
    await c.leerArchivo(ev);
    assert.equal(ev.target.value, "");
    assert.deepEqual([c.error, c.plan.asignaturas.length, c.plan.asignaturas[0].nombre], ["", 68, "Introducción a la Programación"]);
    await c.leerArchivo(evento("utf8.csv", Buffer.from(BOM + csv, "utf8")));
    assert.deepEqual([c.error, c.texto.charCodeAt(0) === 0xfeff, c.plan.asignaturas[0].nombre], ["", false, "Introducción a la Programación"]);
  });

  /* ---------- Hoja ocupada, última fila de Bloqueos, formato de texto y pestaña faltante ---------- */

  /** El candado del script no se consigue: waitLock lanza, como cuando otro guardado tarda más de 10 s. */
  const candadoOcupado = e => {
    e.ctx.LockService.getScriptLock = () => ({ waitLock() { throw new Error("Lock timeout: another process was holding the lock for too long."); }, releaseLock() {} });
  };

  test("candado ocupado: abrir, guardar, mantener, salir y restaurar responden \"La hoja está ocupada…\" sin escribir", () => {
    const e = entorno(TODAS);
    guardarReal(e, "ING");
    const a = datos(e, "planAbrir", CICLO, "ING");
    const plan = planReal(e, "ING"), antes = JSON.stringify([e.hojas.Planes.datos, e.hojas.Bloqueos.datos]);
    candadoOcupado(e);
    for (const [fn, ...args] of [["planAbrir", CICLO, "ING"], ["planGuardar", CICLO, "ING", plan, a.version],
      ["planMantener", CICLO, "ING"], ["planSalir", CICLO, "ING"], ["planRestaurar", CICLO, "ING", 1]])
      assert.equal(fallo(e, fn, ...args), "La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos.", fn);
    assert.equal(JSON.stringify([e.hojas.Planes.datos, e.hojas.Bloqueos.datos]), antes);
  });

  test("con una sola fila en Bloqueos (Google no deja borrarla), guardar y salir la vacían y sueltan el bloqueo", () => {
    const e = entorno(TODAS);
    guardarReal(e, "ING");
    const a = datos(e, "planAbrir", CICLO, "ING");
    e.hojas.Bloqueos.maxFilas = e.hojas.Bloqueos.getLastRow();   /* cabecera + tu bloqueo, como tras mucho uso */
    assert.equal(datos(e, "planGuardar", CICLO, "ING", planReal(e, "ING"), a.version).version, 2);
    assert.deepEqual(bloqueos(e), []);
    datos(e, "planAbrir", CICLO, "ING");
    e.hojas.Bloqueos.maxFilas = e.hojas.Bloqueos.getLastRow();
    assert.deepEqual(datos(e, "planSalir", CICLO, "ING"), {});
    assert.deepEqual(bloqueos(e), []);
  });

  test("las filas que se agregan a Bloqueos y Planes quedan con formato de texto (@)", () => {
    const e = entorno(TODAS);
    const a = datos(e, "planAbrir", CICLO, "ING");
    assert.ok(e.hojas.Bloqueos.conTexto.has(e.hojas.Bloqueos.getLastRow()), "bloqueo nuevo");
    datos(e, "planGuardar", CICLO, "ING", planReal(e, "ING"), a.version);
    assert.ok(e.hojas.Planes.conTexto.has(e.hojas.Planes.getLastRow()), "versión guardada");
    datos(e, "planRestaurar", CICLO, "ING", 1);
    assert.ok(e.hojas.Planes.conTexto.has(e.hojas.Planes.getLastRow()), "versión restaurada");
  });

  test("si falta una pestaña, el mensaje la nombra entre comillas", () => {
    const e = entorno();
    delete e.hojas.Planes;
    assert.equal(fallo(e, "planInicio", CICLO), "Falta la pestaña \"Planes\" en la hoja.");
  });
});

describe("CU-002 · CargaDocente.js y CargaDocenteVista.html", () => {
  /* Pruebas del CU-002 "Carga docente": CargaDocente.js en el Apps Script falso de recorrido.mjs
     (solo este archivo cargado) y los métodos del componente Alpine de CargaDocenteVista.html.
     Los planes se escriben a mano en la pestaña Planes (con el JSON del CU-001): pequeños para las
     reglas, o armados desde el Excel real CargaXCarrera con un intérprete mínimo de esta prueba.
       node --test AppScript/pruebas/carga.test.mjs */
  const CICLO = "2026-1";
  const DIRECTOR = "fmaresg@ulasalle.edu.pe"; /* director de DIMA: ING, ICO, ARQ, IND */
  const OTRO_DIMA = "otro.dima@ulasalle.edu.pe";
  const COORDINADOR = "mfloresl@ulasalle.edu.pe";
  const SIN_BLOQUEO = /^Tu bloqueo venció o lo tomó otra cuenta: lo que no guardaste se perdió\.$/;
  const FUENTE_JS = fs.readFileSync(path.join(RAIZ, "CargaDocente.js"), "utf8");
  const FUENTE_HTML = fs.readFileSync(path.join(RAIZ, "CargaDocenteVista.html"), "utf8");
  const SCRIPTS = [...FUENTE_HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const PUBLICAS = ["cargaInicio", "cargaAbrir", "cargaInterpretar", "cargaBuscarDocentes", "cargaGuardar",
    "cargaMantener", "cargaSalir", "cargaHistorial", "cargaVersion", "cargaRestaurar"];

  /* ---------- ayudas ---------- */

  const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const copia = x => JSON.parse(JSON.stringify(x));

  function ok(r) {
    assert.equal(r.ok, true, r.error);
    return r.datos;
  }
  function falla(r, patron) {
    assert.equal(r.ok, false, "se esperaba un fallo");
    assert.match(r.error, patron);
    return r.error;
  }

  /** Entorno con solo CargaDocente.js; docentes reemplaza el catálogo; planes: { SIGLA: plan }. */
  function entorno(op = {}) {
    const hojas = hojasBase();
    hojas.Usuarios.push([OTRO_DIMA, "director", "", "DIMA"]);
    if (op.docentes) hojas.Docentes = [hojas.Docentes[0], ...op.docentes];
    const e = crearEntorno({ usuario: op.usuario || DIRECTOR, hojas, archivos: ["CargaDocente.js"] });
    for (const [sigla, plan] of Object.entries(op.planes || {})) ponerPlan(e, sigla, plan);
    return e;
  }
  function ponerPlan(e, sigla, plan, version = 1) {
    e.hojas.Planes.datos.push([CICLO, sigla, String(version), "coord@ulasalle.edu.pe", "2026-10-01T10:00:00-05:00", JSON.stringify(plan)]);
  }

  /** Asignatura del modelo del CU-001 con grupos iguales. */
  function asig(codigo, semestre, ht, hp, extra = {}) {
    return { codigo, nombre: extra.nombre || "Curso " + codigo, malla: "2024", semestre, dpto: extra.dpto || "DIMA",
      grupos: (extra.grupos || [1]).map(n => ({ n, ht, hp, th: extra.th ?? ht + hp, obs: extra.obs || "", avisos: [],
        desdoble: extra.desdoble || null, fusion: null })) };
  }

  /** Plan de una hoja de CargaXCarrera (intérprete mínimo, independiente de PlanDeCiclo.js). */
  function planDesdeExcel(hoja, sigla) {
    const filas = hojaEjemplo("CargaXCarrera", hoja);
    const ic = filas.findIndex(f => f.map(norm).includes("CODIGO") && f.map(norm).includes("ASIGNATURA"));
    const cab = filas[ic].map(norm), col = n => cab.indexOf(n), iTotal = cab.indexOf("HT", col("HT") + 1);
    const porCodigo = new Map();
    for (const f of filas.slice(ic + 1)) {
      const codigo = String(f[col("CODIGO")] || "").trim();
      if (!codigo || (norm(f[col("CARRERA")]) && norm(f[col("CARRERA")]) !== sigla)) continue;
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(f[col("SEMESTRE")]).trim());
      let a = porCodigo.get(codigo);
      if (!a) porCodigo.set(codigo, a = { codigo, nombre: f[col("ASIGNATURA")].trim(), malla: f[col("MALLA")], dpto: norm(f[col("DPTO")]),
        semestre: m ? +m[1] : (+f[col("SEMESTRE")] || null), grupos: [] });
      let n = m ? +m[2] : 1;
      while (a.grupos.some(g => g.n === n)) n++;
      a.grupos.push({ n, ht: +f[col("HT")], hp: +f[col("HP")], th: +f[iTotal], obs: String(f[col("OBSERVACIONES")] || "").trim(),
        avisos: [], desdoble: null, fusion: null });
    }
    return { asignaturas: [...porCodigo.values()] };
  }

  /** Abre en edición y guarda; devuelve la respuesta de cargaGuardar. */
  function guardar(e, sigla, asignaciones, motivo = "") {
    const abierta = ok(e.llamar("cargaAbrir", CICLO, sigla));
    assert.equal(abierta.modo, "edicion", abierta.motivo);
    return ok(e.llamar("cargaGuardar", CICLO, sigla, asignaciones, abierta.version, motivo));
  }
  const asg = (clave, comp, docente) => ({ clave, comp, docente });
  /** T y P de un curso de un grupo de ING. */
  const tp = (codigo, docente, grupo = 1) => [asg("ING|" + codigo + "|" + grupo, "T", docente), asg("ING|" + codigo + "|" + grupo, "P", docente)];

  /* Plan de ING para las reglas: horas T/P conocidas por curso. */
  const PLAN_REGLAS = { asignaturas: [
    asig("R.1", 1, 10, 10), asig("R.2", 2, 10, 10), asig("R.3", 3, 1, 1), asig("R.4", 4, 2, 0), asig("R.5", 5, 3, 3),
    asig("R.6", 6, 2, 2, { obs: "INTERNACIONAL - MÉXICO" }), asig("R.7", 1, 2, 0), asig("R.8", 7, 2, 0, { grupos: [1, 2] }),
    asig("R.9", 8, 2, 2, { dpto: "DACTE" })] };
  const DOCENTES_REGLAS = [
    ["DOC TC OTRA", "DIMA", "Contratado", "TP", "", "Sí", ""], ["DOC TC OTRA NO", "DIMA", "Contratado", "TP", "", "No", ""],
    ["DOC ORDINARIO", "DIMA", "Ordinario", "TC", "", "", ""], ["DOC CONTRATADO", "DIMA", "Contratado", "TC", "", "", ""],
    ["DOC PARCIAL", "DIMA", "Contratado", "TP", "", "", ""], ["DOC COMPLETO", "DIMA", "CONTRATADO", "tc", "", "", "10"],
    ["DOC CARGO", "DIMA", "Contratado", "TC", "Jefe de carrera", "", ""], ["DOC DACTE", "DACTE", "Contratado", "TC", "", "", ""]];

  /** Guarda en un entorno nuevo y devuelve { datos, codigos(docente) }. */
  function reglas(asignaciones, motivo = "") {
    const e = entorno({ planes: { ING: PLAN_REGLAS }, docentes: DOCENTES_REGLAS });
    const datos = guardar(e, "ING", asignaciones, motivo);
    return { e, datos, codigos: d => datos.advertencias.filter(a => a.docente === d).map(a => a.codigo) };
  }

  /** Componente Alpine de la vista, con google.script.run atendido por el entorno. */
  function componente(e) {
    const fabricas = {};
    const run = () => {
      let exito = () => {}, fallo = () => {};
      const p = new Proxy({}, { get: (_, k) => {
        if (k === "withSuccessHandler") return f => { exito = f; return p; };
        if (k === "withFailureHandler") return f => { fallo = f; return p; };
        return (...args) => setTimeout(() => { try { exito(e.llamar(k, ...args)); } catch (err) { fallo(err); } }, 0);
      } });
      return p;
    };
    const ctx = vm.createContext({
      Alpine: { data: (n, f) => { fabricas[n] = f; }, store: () => ({ vista: "inicio" }) },
      document: { addEventListener: (ev, cb) => { if (ev === "alpine:init") cb(); } },
      window: { addEventListener() {} }, confirm: () => true, setInterval: () => 7, clearInterval() {}, TextDecoder, console,
      google: { script: { get run() { return run(); } } }
    });
    SCRIPTS.forEach(s => vm.runInContext(s, ctx));
    return fabricas.cargaDocente();
  }

  /* ---------- contrato de los archivos ---------- */

  test("CargaDocente.js: prefijo, funciones públicas exactas y JSDoc en cada función", () => {
    const declaradas = [...FUENTE_JS.matchAll(/^(?:function\s+|var\s+|let\s+|const\s+)([\w$]+)/gm)].map(m => m[1]);
    /* Una función por acción, escrita de arriba abajo: 10 públicas y unas pocas constantes. */
    assert.ok(declaradas.length >= 10);
    assert.deepEqual(declaradas.filter(n => !/^carga/i.test(n)), [], "identificadores sin prefijo \"carga\"");
    const funciones = [...FUENTE_JS.matchAll(/^function\s+([\w$]+)/gm)].map(m => m[1]);
    assert.deepEqual(funciones.filter(n => !/_$/.test(n)).sort(), [...PUBLICAS].sort());
    for (const m of FUENTE_JS.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*\nfunction\s+(\w+)\(([^)]*)\)/g)) {
      assert.match(m[1], /@returns/, m[2] + " sin @returns");
      m[3].split(",").map(s => s.trim()).filter(Boolean).forEach(p => assert.match(m[1], new RegExp("@param \\{.*\\} \\[?" + p + "\\b"), m[2] + " sin @param " + p));
    }
    assert.equal([...FUENTE_JS.matchAll(/\*\/\s*\nfunction\s/g)].length, funciones.length, "alguna función no tiene JSDoc");
    const e = crearEntorno({ archivos: ["CargaDocente.js"] });
    PUBLICAS.forEach(n => assert.equal(typeof e.ctx[n], "function", n));
  });

  test("CargaDocenteVista.html: scripts válidos, sin \"//\" ni \"<?\", sin nombrar el otro CU", () => {
    assert.ok(SCRIPTS.length >= 1);
    SCRIPTS.forEach(s => { new vm.Script(s); assert.ok(!s.includes("//"), "\"//\" en el JavaScript del navegador"); });
    assert.ok(!FUENTE_HTML.includes("<?"), "\"<?\" en la vista");
    assert.doesNotMatch(FUENTE_HTML, /\bplan[A-Z]\w*|planDeCiclo/);
    assert.match(FUENTE_HTML, /x-show="\$store\.nav\.vista === 'carga'" x-data="cargaDocente"/);
    /* Alpine 3 deja puesto un atributo booleano ligado a "": todo :disabled (y similares) debe dar true o false. */
    const booleanos = [...FUENTE_HTML.matchAll(/(?:x-bind)?:(disabled|checked|selected|readonly|required|hidden)="([^"]*)"/g)];
    assert.ok(booleanos.length >= 10);
    booleanos.forEach(m => assert.match(m[2], /^!!|===|!==/, "\":" + m[1] + "\" ligado a un valor que puede ser \"\": " + m[2]));
    for (const n of ["ocupado === 'guardar' ? 'Guardando…'", "ocupado === 'buscar' ? 'Buscando…'", "ocupado === 'interpretar' ? 'Interpretando…'",
      'x-for="s in doc.secciones"', 'x-for="r in resultados"', 'x-for="(a, i) in advertencias"', 'list="cargaCatalogo"', 'accept=".csv"'])
      assert.ok(FUENTE_HTML.includes(n), "falta " + n);
    const c = componente(crearEntorno({ archivos: ["CargaDocente.js"] }));
    const llamadas = PUBLICAS.map(n => n.replace(/^carga/, "")).map(v => v[0].toLowerCase() + v.slice(1));
    llamadas.forEach(m => assert.equal(typeof c[m], "function", "falta el método " + m));
  });

  /* ---------- acceso, ciclo y permisos ---------- */

  test("acceso denegado: sin correo, otro dominio, sin rol o fuera de Usuarios", () => {
    const e = entorno();
    falla(e.como("").llamar("cargaInicio", ""), /^Acceso denegado: cuenta no identificada/);
    falla(e.como("alguien@gmail.com").llamar("cargaInicio", ""), /^Acceso denegado: cuenta fuera del dominio/);
    falla(e.como("sinrol@ulasalle.edu.pe").llamar("cargaBuscarDocentes", "", "zegarra"), /^Acceso denegado: cuenta sin rol/);
    falla(e.como("nadie@ulasalle.edu.pe").llamar("cargaAbrir", CICLO, "ING"), /^Acceso denegado/);
  });

  test("cargaInicio: ciclo vacío = el último, ciclo o carrera desconocidos, permisos por departamento", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    const d = ok(e.llamar("cargaInicio", ""));
    assert.deepEqual(d.ciclos, ["2026-1", "2026-2"]);
    assert.equal(d.ciclo, "2026-2");
    falla(e.llamar("cargaInicio", "1999-1"), /^Ciclo desconocido/);
    falla(e.llamar("cargaAbrir", CICLO, "XYZ"), /^Carrera desconocida/);
    const i = ok(e.llamar("cargaInicio", CICLO));
    assert.equal(i.carreras.length, 8);
    assert.deepEqual(i.carreras.filter(c => c.puedeEditar).map(c => c.sigla).sort(), ["ARQ", "ICO", "IND", "ING"]);
    const ing = i.carreras.find(c => c.sigla === "ING");
    assert.deepEqual([ing.versionPlan, ing.version, ing.asignados, ing.componentes, ing.departamento], [1, 0, 0, 16, "DIMA"]);
    assert.equal(i.carreras.find(c => c.sigla === "DER").versionPlan, 0);
    e.como(COORDINADOR);
    assert.deepEqual(ok(e.llamar("cargaInicio", CICLO)).carreras.filter(c => c.puedeEditar), []);
    e.como("afrontadof@ulasalle.edu.pe"); /* director sin departamento */
    assert.deepEqual(ok(e.llamar("cargaInicio", CICLO)).carreras.filter(c => c.puedeEditar), []);
    e.como("dir.dacj@ulasalle.edu.pe");
    assert.deepEqual(ok(e.llamar("cargaInicio", CICLO)).carreras.filter(c => c.puedeEditar).map(c => c.sigla), ["DER"]);
  });

  test("permisos: el coordinador y el director de otro departamento ven en lectura y no guardan", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS, DER: { asignaturas: [asig("2.1.1.24", 1, 2, 2)] } } });
    falla(e.llamar("cargaAbrir", CICLO, "ADM"), /^ADM no tiene plan registrado en 2026-1$/);
    for (const correo of [COORDINADOR, "dir.dacj@ulasalle.edu.pe"]) {
      e.como(correo);
      const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
      assert.equal(a.modo, "lectura");
      assert.equal(a.motivo, "Solo lectura: no es una carrera de tu departamento");
      falla(e.llamar("cargaGuardar", CICLO, "ING", tp("R.1", "DOC X"), 0, ""), /^Solo el director de DIMA puede editar la carga de ING\.$/);
      falla(e.llamar("cargaRestaurar", CICLO, "ING", 1), /^Solo el director de DIMA/);
    }
    assert.equal(e.hojas.Bloqueos.datos.length, 1, "la lectura no toma bloqueo");
    assert.equal(ok(e.llamar("cargaAbrir", CICLO, "DER")).modo, "edicion"); /* dir.dacj edita DER */
  });

  /* ---------- secciones y componentes ---------- */

  test("secciones: T/P, desdoble, solo TH, horas no numéricas, internacional", () => {
    const plan = { asignaturas: [
      asig("S.1", 1, 2, 4, { desdoble: { componente: "P", n: 2 } }), asig("S.2", 1, 3, 2, { desdoble: { componente: "T", n: 3 } }),
      asig("S.3", 2, 0, 0, { th: 3 }), asig("S.4", 2, 2, 0, { obs: "curso virtual" }),
      { codigo: "S.5", nombre: "Raro", semestre: null, dpto: "DIMA", grupos: [{ n: 1, ht: "dos", hp: 2, th: 4, obs: "" }] }] };
    const e = entorno({ planes: { ING: plan } });
    const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    const comps = clave => a.secciones.find(s => s.clave === clave).componentes.map(c => c.comp + ":" + c.horas).join(" ");
    assert.equal(comps("ING|S.1|1"), "T:2 P1:4 P2:4");
    assert.equal(comps("ING|S.2|1"), "T1:3 T2:3 T3:3 P:2");
    assert.equal(comps("ING|S.3|1"), "T:3");
    assert.equal(comps("ING|S.5|1"), "P:2");
    assert.match(a.secciones.find(s => s.clave === "ING|S.5|1").avisos[0], /HT no numérico/);
    assert.deepEqual(a.secciones.map(s => s.intl), [false, false, false, true, false]);
    const s1 = a.secciones[0];
    assert.deepEqual([s1.codigo, s1.asignatura, s1.semestre, s1.grupo, s1.dpto, s1.ht, s1.hp, s1.th, s1.fusion], ["S.1", "Curso S.1", 1, 1, "DIMA", 2, 4, 6, ""]);
    assert.deepEqual(a.catalogo[0], { docente: "ALATRISTA CORRALES ARTURO", departamento: "DACTE" });
  });

  test("fusiones entre carreras: se asigna en la del principal; en las demás, \"fusionado con …\"", () => {
    const ing = { asignaturas: [asig("3.1.3.24", 1, 3, 2), asig("3.1.1.24", 1, 2, 4, { grupos: [1, 2] }), asig("3.1.2.24", 1, 2, 2, { grupos: [1, 2] })] };
    const adm = { asignaturas: [asig("1.1.4.24", 1, 3, 2), asig("1.1.5.24", 1, 2, 2)] };
    const ref = (carrera, codigo, grupo) => ({ carrera, codigo, grupo, nombre: "x", ht: 2, hp: 2, th: 4 });
    /* ADM crea una fusión con principal en ING y otra que incluye un grupo de ING ya fusionado en su propio plan. */
    adm.asignaturas[0].grupos[0].fusion = { id: "F1", principal: ref("ING", "3.1.3.24", 1), miembros: [ref("ING", "3.1.3.24", 1), ref("ADM", "1.1.4.24", 1)] };
    adm.asignaturas[1].grupos[0].fusion = { id: "F2", principal: ref("ADM", "1.1.5.24", 1), miembros: [ref("ADM", "1.1.5.24", 1), ref("ING", "3.1.2.24", 1)] };
    const f3 = { id: "F1", principal: ref("ING", "3.1.1.24", 1), miembros: [ref("ING", "3.1.1.24", 1), ref("ING", "3.1.1.24", 2)] };
    const f4 = { id: "F2", principal: ref("ING", "3.1.2.24", 2), miembros: [ref("ING", "3.1.2.24", 1), ref("ING", "3.1.2.24", 2)] };
    ing.asignaturas[1].grupos.forEach(g => { g.fusion = f3; });
    ing.asignaturas[2].grupos.forEach(g => { g.fusion = f4; });
    const e = entorno({ planes: { ING: ing, ADM: adm } });
    const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    assert.deepEqual(a.secciones.map(s => s.clave), ["ING|3.1.3.24|1", "ING|3.1.1.24|1", "ING|3.1.2.24|2"]);
    assert.equal(a.secciones[0].fusion, "con ADM 1.1.4.24-1");
    assert.equal(a.secciones[1].fusion, "con ING 3.1.1.24-2");
    assert.deepEqual(a.noAsignables.map(f => f.texto), ["fusionado con el grupo 1 de 3.1.1.24", "fusionado con el grupo 2 de 3.1.2.24"]);
    const cab = "DOCENTE\tCARRERA\tSEMESTRE\tCODIGO\tASIGNATURA\tHT\tHP\n";
    const r = ok(e.llamar("cargaInterpretar", cab + "ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN\tING\t1-2\t3.1.1.24\tIntro\t2\t4", CICLO, "ING"));
    assert.deepEqual(r.asignaciones.map(x => x.clave + " " + x.comp), ["ING|3.1.1.24|1 T", "ING|3.1.1.24|1 P"]);
    e.como("dir.dacte@ulasalle.edu.pe");
    const d = ok(e.llamar("cargaAbrir", CICLO, "ADM"));
    assert.deepEqual(d.secciones.map(s => s.clave + " " + s.fusion), ["ADM|1.1.5.24|1 con ING 3.1.2.24-1"]);
    assert.deepEqual(d.noAsignables.map(f => f.codigo + " " + f.texto), ["1.1.4.24 fusionado con ING 3.1.3.24 grupo 1"]);
    const s = ok(e.llamar("cargaInterpretar", cab + "ALFARO BEJARANO JULIO CARLO\tADM\t1\t1.1.4.24\tMatemática\t3\t2", CICLO, "ADM"));
    assert.deepEqual(s.asignaciones, []);
    assert.deepEqual(s.sinSeccion.map(x => x.motivo), ["se asigna en ING"]);
  });

  /* ---------- carga masiva ---------- */

  test("CARGA DIMA real sobre el plan de ING: herencia, TOTAL, emparejamiento, componentes, desdoble, catálogo, descartadas", () => {
    const plan = planDesdeExcel("Ing. Software", "ING");
    assert.deepEqual([plan.asignaturas.length, plan.asignaturas.reduce((n, a) => n + a.grupos.length, 0)], [68, 75]);
    plan.asignaturas.find(a => a.codigo === "3.2.3.24").grupos[0].desdoble = { componente: "P", n: 2 };
    const e = entorno({ planes: { ING: plan } });
    const dima = hojaEjemplo("CargaXDepartamento", "CARGA DIMA 2026-I"), filasIng = dima.filter(f => f[4] && norm(f[1]) === "ING");
    const r = ok(e.llamar("cargaInterpretar", aTsv(dima), CICLO, "ING"));
    const de = (clave) => r.asignaciones.filter(a => a.clave === clave).map(a => a.comp + " " + a.docente);
    assert.equal(r.descartadas, 35);
    assert.deepEqual(r.sinSeccion, []);
    assert.deepEqual(de("ING|3.5.5.24|1"), ["T VELASQUEZ DOIG MIGUEL EDUARDO", "P VELASQUEZ DOIG MIGUEL EDUARDO"], "hereda el docente de arriba");
    assert.deepEqual(de("ING|3.3.1.24|1"), ["T PATIÑO HERRERA LUIS ENRIQUE", "P PATIÑO HERRERA LUIS ENRIQUE"]);
    assert.deepEqual(de("ING|3.3.1.24|2"), ["P PATIÑO HERRERA LUIS ENRIQUE"], "\"3 - 2\" es el grupo 2 y solo trae HP");
    assert.deepEqual(de("ING|3.2.2.24|1"), ["T QUIROZ PILCO MARIBEL ROSARIO"], "solo HT");
    assert.deepEqual(de("ING|3.2.3.24|1"), ["T APAZA VALDIVIA ADELUZ", "P1 APAZA VALDIVIA ADELUZ"], "desdoble: primer subcomponente libre");
    assert.ok(r.asignaciones.every(a => !/TOTAL/.test(a.docente)));
    assert.equal(filasIng.length, 54);
    assert.equal(r.asignaciones.length, filasIng.reduce((n, f) => n + (+f[6] > 0) + (+f[7] > 0), 0));
    assert.equal(r.asignaciones.length, 104, "54 filas de ING: T y P, salvo 4 que solo traen HT o HP");
    assert.ok(r.noEnCatalogo.includes("ORTIZ SOTO RODRIGO ALONSO"));
    assert.ok(!r.noEnCatalogo.includes("ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN") && !r.noEnCatalogo.includes("FLORES PARRA JOSUE MIGUEL"));
    assert.equal(new Set(r.noEnCatalogo).size, r.noEnCatalogo.length, "sin repetidos");
    assert.match(r.avisos[0], /^Se descartaron 35 filas de otra carrera/);
    const g = guardar(e, "ING", r.asignaciones.map(a => asg(a.clave, a.comp, a.docente)));
    assert.equal(g.guardado, true);
    assert.equal(g.advertencias.filter(a => a.nivel === "bloqueo").length, 0);
    assert.ok(g.advertencias.some(a => a.codigo === "A13"));
    assert.ok(g.advertencias.some(a => a.codigo === "—" && a.docente === "ORTIZ SOTO RODRIGO ALONSO"));
    const fila = e.hojas.Cargas.datos[1];
    assert.deepEqual(fila.slice(0, 4), [CICLO, "ING", "1", DIRECTOR]);
    assert.ok(fila[6].length < 25000, "el JSON cabe holgado en una celda: " + fila[6].length);
    const guardadas = JSON.parse(fila[6]).asignaciones;
    assert.equal(guardadas.length, 104);
    assert.deepEqual(guardadas.find(a => a.clave === "ING|3.1.1.24|1" && a.comp === "P"), { clave: "ING|3.1.1.24|1", comp: "P",
      docente: "ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN", horas: 4, codigo: "3.1.1.24", semestre: 1, dpto: "DIMA", intl: false });
    assert.equal(guardadas.find(a => a.clave === "ING|3.6.6.21|1").docente, "FLORES PARRA JOSUE MIGUEL");
  });

  test("carga masiva: CSV con \";\" y \",\", comillas y saltos de línea, nombres con coma, TOTAL termina el bloque", () => {
    const plan = { asignaturas: [asig("C.1", 1, 2, 2), asig("C.2", 2, 2, 4, { desdoble: { componente: "P", n: 2 } })] };
    const docentes = [["ALONSO GUTIERREZ ANDREA JUDITH", "DIMA", "Contratado", "TC"]];
    const e = entorno({ planes: { ING: plan }, docentes });
    const filas = [["Reporte 2026"], [], ["DOCENTE", "CARRERA", "MALLA", "SEMESTRE", "CÓDIGO", "CURSO", "HORAS \nTEÓRICAS", "HORAS PRÁCTICAS", "TOTAL\nHORAS"],
      ["Alonso Gutiérrez, Andrea Judith", "ING ", "2024", "1", "C.1", "Curso; uno, \"bis\"", "2", "2", "4"],
      ["", "ING", "2024", "2", "C.2", "Dos", "0", "4", "4"], ["", "ING", "2024", "2", "C.2", "Dos", "0", "4", "4"],
      ["", "ING", "2024", "2", "C.2", "Dos", "0", "4", "4"], ["", "ADM", "2024", "1", "1.1.1.24", "Otra", "2", "2", "4"],
      ["", "", "", "", "", "", "", "TOTAL", "16"], ["", "ING", "2024", "1", "C.1", "Sin docente", "2", "2", "4"],
      ["PEREZ", "ING", "2024", "3", "C.9", "No existe", "2", "2", "4"], ["PEREZ", "ING", "2024", "1-1", "C.1", "Repetido", "2", "0", "2"]];
    for (const sep of [";", ","]) {
      const csv = "\uFEFF" + filas.map(f => f.map(c => /[;,"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c).join(sep)).join("\r\n");
      const r = ok(e.llamar("cargaInterpretar", csv, CICLO, "ING"));
      assert.deepEqual(r.asignaciones.map(a => a.clave + " " + a.comp + " " + a.docente + " f" + a.fila), [
        "ING|C.1|1 T ALONSO GUTIERREZ ANDREA JUDITH f4", "ING|C.1|1 P ALONSO GUTIERREZ ANDREA JUDITH f4",
        "ING|C.2|1 P1 ALONSO GUTIERREZ ANDREA JUDITH f5", "ING|C.2|1 P2 ALONSO GUTIERREZ ANDREA JUDITH f6"], sep);
      assert.deepEqual(r.sinSeccion.map(s => s.fila + " " + s.motivo), ["10 sin docente", "11 no está en el plan"]);
      assert.equal(r.descartadas, 1);
      assert.deepEqual(r.noEnCatalogo, []);
      assert.equal(r.avisos.filter(a => /ya se asignó/.test(a)).length, 2, "C.2 tercera fila y C.1 repetido");
    }
    falla(e.llamar("cargaInterpretar", "  \n ", CICLO, "ING"), /^Pega el rango o sube un CSV$/);
    falla(e.llamar("cargaInterpretar", "A\tB\n1\t2", CICLO, "ING"), /^No encontré la fila de cabeceras/);
    falla(e.llamar("cargaInterpretar", "DOCENTE\tCODIGO", CICLO, "DER"), /^DER no tiene plan registrado en 2026-1$/);
    const nuevo = ok(e.llamar("cargaInterpretar", "DOCENTE\tCODIGO\tHT\tHP\nNuevo  Docente\tC.1\t2\t2", CICLO, "ING"));
    assert.deepEqual(nuevo.noEnCatalogo, ["Nuevo Docente"]);
  });

  test("CARGA DACJ real sobre el plan de DER: \"TOTAL PROFESORES\"… en la columna CÓDIGO terminan el bloque", () => {
    const e = entorno({ planes: { DER: planDesdeExcel("Derecho", "DER") } });
    const dacj = hojaEjemplo("CargaXDepartamento", "CARGA  DACJ 2026-I");
    assert.equal(norm(dacj[139][4]), "TOTAL PROFESORES", "la hoja real pone el resumen en la columna CÓDIGO");
    const r = ok(e.llamar("cargaInterpretar", aTsv(dacj), CICLO, "DER"));
    assert.deepEqual(r.sinSeccion.map(s => s.codigo + " " + s.motivo), ["2.7.5.24 no está en el plan"]);
    assert.ok(![...r.asignaciones, ...r.sinSeccion].some(a => /TOTAL/.test(norm(a.codigo))));
    assert.deepEqual([r.asignaciones.length, r.descartadas], [132, 10]);
    assert.match(r.avisos.at(-1), /^1 filas sin sección asignable/);
  });

  /* ---------- reglas al guardar ---------- */

  test("A07: más de 40 h impide guardar y conserva el bloqueo; 40 h sí se guarda", () => {
    const { e, datos, codigos } = reglas([...tp("R.1", "DOC CONTRATADO"), ...tp("R.2", "DOC CONTRATADO"), asg("ING|R.4|1", "T", "DOC CONTRATADO")]);
    assert.equal(datos.guardado, false);
    assert.deepEqual(codigos("DOC CONTRATADO"), ["A07"]);
    assert.equal(datos.advertencias.find(a => a.codigo === "A07").texto, "Supera las 40 h lectivas (42 h). No se puede guardar.");
    assert.equal(datos.advertencias.find(a => a.codigo === "A07").nivel, "bloqueo");
    assert.equal(e.hojas.Cargas.datos.length, 1, "no escribió versión");
    ok(e.llamar("cargaMantener", CICLO, "ING"));
    const r = ok(e.llamar("cargaGuardar", CICLO, "ING", [...tp("R.1", "DOC CONTRATADO"), ...tp("R.2", "DOC CONTRATADO")], 0, ""));
    assert.equal(r.guardado, true);
    assert.deepEqual(r.advertencias.filter(a => a.docente).map(a => a.codigo), []);
    assert.equal(e.hojas.Bloqueos.datos.length, 1, "guardar suelta el bloqueo");
  });

  test("A08, A09, A10, A15 y \"no está en Docentes\": casos que disparan y que no", () => {
    const caso = (asignaciones, docente) => reglas(asignaciones).codigos(docente);
    const h18 = d => [asg("ING|R.1|1", "T", d), ...tp("R.5", d), asg("ING|R.4|1", "T", d)];
    const h16 = d => [asg("ING|R.1|1", "T", d), ...tp("R.5", d)];
    assert.deepEqual(caso(h18("DOC TC OTRA"), "DOC TC OTRA"), ["A08"]);
    assert.deepEqual(caso(h16("DOC TC OTRA"), "DOC TC OTRA"), []);
    assert.deepEqual(caso(h18("DOC TC OTRA NO"), "DOC TC OTRA NO"), []);
    const h26 = d => [...tp("R.1", d), ...tp("R.5", d)];
    const h24 = d => [...tp("R.1", d), asg("ING|R.4|1", "T", d), ...tp("R.3", d)];
    assert.deepEqual(caso(h26("DOC ORDINARIO"), "DOC ORDINARIO"), ["A09"]);
    assert.deepEqual(caso(h24("DOC ORDINARIO"), "DOC ORDINARIO"), []);
    assert.deepEqual(caso(h26("DOC CONTRATADO"), "DOC CONTRATADO"), []);
    assert.deepEqual(caso(tp("R.5", "DOC PARCIAL"), "DOC PARCIAL"), ["A10"]);
    assert.deepEqual(caso(tp("R.6", "DOC PARCIAL"), "DOC PARCIAL"), [], "solo cursos internacionales");
    assert.deepEqual(caso([...tp("R.5", "DOC PARCIAL"), ...tp("R.3", "DOC PARCIAL")], "DOC PARCIAL"), [], "8 h");
    assert.deepEqual(caso(tp("R.5", "DOC CONTRATADO"), "DOC CONTRATADO"), [], "TC con 6 h");
    assert.deepEqual(caso(h16("DOC COMPLETO"), "DOC COMPLETO"), ["A15"], "16 + 10 < 40");
    assert.deepEqual(caso([...tp("R.1", "DOC COMPLETO"), ...tp("R.5", "DOC COMPLETO"), ...tp("R.6", "DOC COMPLETO")], "DOC COMPLETO"), [], "30 + 10");
    assert.deepEqual(caso(h16("DOC CONTRATADO"), "DOC CONTRATADO"), [], "TC sin NO_LECTIVAS");
    const r = reglas(tp("R.5", "Nadie Conocido"));
    assert.deepEqual(r.codigos("Nadie Conocido"), ["—"]);
    assert.equal(r.datos.advertencias.find(a => a.codigo === "—").nivel, "advertencia");
    assert.deepEqual(reglas(tp("R.5", "doc parcial")).codigos("DOC PARCIAL"), ["A10"], "se usa el nombre del catálogo");
  });

  test("A11, A13 y A14: cursos del mismo semestre, componentes sin docente y préstamos", () => {
    const a11 = reglas([asg("ING|R.1|1", "T", "DOC CONTRATADO"), asg("ING|R.7|1", "T", "DOC CONTRATADO")]);
    assert.deepEqual(a11.codigos("DOC CONTRATADO"), ["A11"]);
    assert.match(a11.datos.advertencias.find(a => a.codigo === "A11").texto, /2 cursos distintos en ING, semestre 1 \(R\.1, R\.7\)/);
    assert.deepEqual(reglas([asg("ING|R.8|1", "T", "DOC CONTRATADO"), asg("ING|R.8|2", "T", "DOC CONTRATADO")]).codigos("DOC CONTRATADO"), [],
      "dos grupos del mismo curso");
    assert.deepEqual(reglas([asg("ING|R.1|1", "T", "DOC CONTRATADO"), asg("ING|R.2|1", "T", "DOC CONTRATADO")]).codigos("DOC CONTRATADO"), []);
    assert.deepEqual(reglas([asg("ING|R.1|1", "T", "FUERA CATALOGO"), asg("ING|R.7|1", "T", "FUERA CATALOGO")]).codigos("FUERA CATALOGO"),
      ["A11", "—"], "A11 también para quien no está en Docentes");
    const a13 = reglas(tp("R.1", "DOC CONTRATADO")).datos.advertencias.find(a => a.codigo === "A13");
    assert.deepEqual([a13.texto, a13.docente, a13.nivel], ["Quedan 14 componentes sin docente.", "", "advertencia"]);
    const todas = PLAN_REGLAS.asignaturas.flatMap(a => a.grupos.flatMap(g => [g.ht > 0 && "T", g.hp > 0 && "P"].filter(Boolean)
      .map(c => asg("ING|" + a.codigo + "|" + g.n, c, "Docente " + a.codigo + g.n + c))));
    assert.ok(!reglas(todas).datos.advertencias.some(a => a.codigo === "A13"));
    const a14 = reglas([...tp("R.9", "DOC CONTRATADO"), ...tp("R.5", "DOC DACTE")]);
    assert.deepEqual(a14.codigos("DOC CONTRATADO"), ["A14"]);
    assert.equal(a14.datos.advertencias.find(a => a.codigo === "A14").nivel, "info");
    assert.match(a14.datos.advertencias.find(a => a.codigo === "A14").texto, /Es de DIMA y dicta cursos de DACTE/);
    assert.deepEqual(a14.codigos("DOC DACTE"), ["A14"]);
    assert.deepEqual(reglas(tp("R.9", "DOC DACTE")).codigos("DOC DACTE"), []);
  });

  test("A12: con cargo, más de 20 h avisa y más de 24 h exige motivo", () => {
    assert.deepEqual(reglas([...tp("R.1", "DOC CARGO"), asg("ING|R.4|1", "T", "DOC CARGO")]).codigos("DOC CARGO"), ["A12"]);
    assert.deepEqual(reglas([...tp("R.1", "DOC CARGO")]).codigos("DOC CARGO"), []);
    assert.deepEqual(reglas([...tp("R.1", "DOC CONTRATADO"), ...tp("R.5", "DOC CONTRATADO")]).codigos("DOC CONTRATADO"), [], "sin cargo");
    const sin = reglas([...tp("R.1", "DOC CARGO"), ...tp("R.5", "DOC CARGO")]);
    assert.deepEqual([sin.datos.guardado, sin.datos.requiereMotivo], [false, true]);
    assert.equal(sin.datos.advertencias.find(a => a.codigo === "A12").nivel, "motivo");
    assert.equal(sin.e.hojas.Cargas.datos.length, 1);
    const con = ok(sin.e.llamar("cargaGuardar", CICLO, "ING", [...tp("R.1", "DOC CARGO"), ...tp("R.5", "DOC CARGO")], 0, "  Falta de docentes en el área  "));
    assert.deepEqual([con.guardado, con.requiereMotivo, con.version], [true, false, 1]);
    assert.equal(sin.e.hojas.Cargas.datos[1][5], "Falta de docentes en el área");
    assert.match(ok(sin.e.llamar("cargaHistorial", CICLO, "ING")).versiones[0].resumen, /^4 de 16 componentes con docente · motivo: Falta de docentes/);
  });

  test("las horas suman las cargas vigentes de todas las carreras del ciclo", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS, IND: { asignaturas: [asig("17.1.1.24", 1, 10, 10), asig("17.1.2.24", 2, 5, 5)] } }, docentes: DOCENTES_REGLAS });
    const ind = guardar(e, "IND", [asg("IND|17.1.1.24|1", "T", "DOC CONTRATADO"), asg("IND|17.1.1.24|1", "P", "DOC CONTRATADO"),
      asg("IND|17.1.2.24|1", "T", "DOC CONTRATADO"), asg("IND|17.1.2.24|1", "P", "DOC CONTRATADO")]);
    assert.equal(ind.guardado, true);
    const ing = guardar(e, "ING", [...tp("R.5", "DOC CONTRATADO"), ...tp("R.6", "DOC CONTRATADO"), asg("ING|R.4|1", "T", "DOC CONTRATADO")]);
    assert.equal(ing.guardado, false, "30 h en IND + 12 h en ING");
    assert.equal(ing.advertencias.find(a => a.codigo === "A07").texto, "Supera las 40 h lectivas (42 h). No se puede guardar.");
    const bien = ok(e.llamar("cargaGuardar", CICLO, "ING", tp("R.5", "DOC CONTRATADO"), 0, ""));
    assert.equal(bien.guardado, true, "30 + 6 = 36 h");
    /* Guardar IND otra vez reemplaza su carga: lo de ING sigue contando. */
    const otra = guardar(e, "IND", [asg("IND|17.1.1.24|1", "T", "DOC CONTRATADO"), asg("IND|17.1.1.24|1", "P", "DOC CONTRATADO"),
      asg("IND|17.1.2.24|1", "T", "DOC CONTRATADO"), asg("IND|17.1.2.24|1", "P", "DOC CONTRATADO"), asg("IND|17.1.1.24|1", "P", "DOC CONTRATADO")]);
    assert.equal(otra.guardado, true);
    assert.ok(otra.advertencias.some(a => /Se descartaron 1 asignaciones/.test(a.texto)), "componente repetido");
  });

  /* ---------- saneamiento, versionado, conflicto y bloqueo ---------- */

  test("guardar sanea: vacías, componentes que no existen, nombre del catálogo, horas del servidor, motivo ≤ 500", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    ok(e.llamar("cargaAbrir", CICLO, "ING"));
    falla(e.llamar("cargaGuardar", CICLO, "ING", "nada", 0, ""), /^Las asignaciones no tienen el formato esperado\.$/);
    for (const base of ["x", true, [], null, " "]) falla(e.llamar("cargaGuardar", CICLO, "ING", [], base, ""), /^Versión base inválida\.$/);
    falla(e.llamar("cargaGuardar", CICLO, "ING", [], 3, ""), /^La versión base \(v3\) no existe: sal y vuelve a abrir la carga\.$/);
    const largo = "Z".repeat(200);
    const r = ok(e.llamar("cargaGuardar", CICLO, "ING", [
      { clave: "ING|R.1|1", comp: "T", docente: "  zegarra mejía,  milagros rocío del carmen. ", horas: 99 },
      { clave: "ING|R.1|1", comp: "P", docente: "   " }, { clave: "ING|R.1|9", comp: "T", docente: "X" }, { clave: "ING|R.4|1", comp: "P", docente: "X" },
      { clave: "ING|R.2|1", comp: "T", docente: { a: 1 } }, { clave: "ING|R.2|1", comp: "P", docente: 12345 },
      null, { clave: "ING|R.3|1", comp: "T", docente: largo }], "0", "=" + "m".repeat(600)));
    assert.equal(r.guardado, true);
    assert.match(r.advertencias[0].texto, /^Se descartaron 2 asignaciones/);
    const fila = e.hojas.Cargas.datos[1], contenido = JSON.parse(fila[6]);
    assert.deepEqual(contenido.asignaciones.map(a => [a.docente.length > 100 ? a.docente.length : a.docente, a.horas]),
      [["ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN", 10], [120, 1]]);
    assert.equal(fila[5].length, 500);
    assert.equal(fila[5][0], "=", "el motivo con \"=\" se escribió con apóstrofo (el falso falla con fórmulas)");
    ok(e.llamar("cargaAbrir", CICLO, "ING"));
    assert.equal(ok(e.llamar("cargaGuardar", CICLO, "ING", [], 1, { m: 1 })).version, 2);
    assert.equal(e.hojas.Cargas.datos[2][5], "", "un motivo que no es texto se guarda vacío");
  });

  test("versionado: cada guardado añade una versión; conflicto si hay una más nueva", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    assert.equal(guardar(e, "ING", tp("R.1", "DOC A")).version, 1);
    assert.equal(guardar(e, "ING", tp("R.2", "DOC B")).version, 2);
    assert.deepEqual(e.hojas.Cargas.datos.slice(1).map(f => f[2]), ["1", "2"]);
    assert.match(e.hojas.Cargas.datos[2][4], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d-05:00$/);
    const abierta = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    assert.equal(abierta.version, 2);
    assert.deepEqual(abierta.secciones.find(s => s.clave === "ING|R.2|1").componentes.map(c => c.docente), ["DOC B", "DOC B"]);
    e.hojas.Cargas.datos.push([CICLO, "ING", "3", "otra@ulasalle.edu.pe", "2026-10-15T11:01:11-05:00", "", JSON.stringify({ asignaciones: [] })]);
    falla(e.llamar("cargaGuardar", CICLO, "ING", [], 2, ""),
      /^Hay una versión más nueva \(v3, guardada por otra@ulasalle\.edu\.pe el 2026-10-15 11:01\)\. Sal y vuelve a abrir para ver los cambios\.$/);
    const i = ok(e.llamar("cargaInicio", CICLO)).carreras.find(c => c.sigla === "ING");
    assert.deepEqual([i.version, i.usuario, i.asignados, i.editor], [3, "otra@ulasalle.edu.pe", 0, DIRECTOR]);
  });

  test("bloqueo: otra cuenta ve \"En edición por\", vence a los 31 min, mantener renueva, salir suelta", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    assert.equal(a.modo, "edicion");
    assert.match(a.vence, /-05:00$/);
    assert.deepEqual(e.hojas.Bloqueos.datos[1].slice(0, 4), ["carga", CICLO, "ING", DIRECTOR]);
    e.como(OTRO_DIMA);
    const b = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    assert.deepEqual([b.modo, b.motivo, b.editor], ["lectura", "En edición por " + DIRECTOR, DIRECTOR]);
    falla(e.llamar("cargaGuardar", CICLO, "ING", [], 0, ""), SIN_BLOQUEO);
    falla(e.llamar("cargaRestaurar", CICLO, "ING", 1), /^No se puede restaurar: la carga está en edición por fmaresg/);
    ok(e.llamar("cargaSalir", CICLO, "ING"));
    assert.equal(e.hojas.Bloqueos.datos.length, 2, "salir de otra cuenta no suelta el bloqueo ajeno");
    e.como(DIRECTOR).avanzar(20 * 60000);
    const m = ok(e.llamar("cargaMantener", CICLO, "ING"));
    assert.ok(m.vence > a.vence);
    e.avanzar(20 * 60000);
    assert.equal(ok(e.llamar("cargaGuardar", CICLO, "ING", tp("R.1", "DOC A"), 0, "")).guardado, true, "siguió vigente gracias a mantener");
    ok(e.llamar("cargaAbrir", CICLO, "ING"));
    e.avanzar(31 * 60000);
    falla(e.llamar("cargaMantener", CICLO, "ING"), SIN_BLOQUEO);
    falla(e.llamar("cargaGuardar", CICLO, "ING", [], 1, ""), SIN_BLOQUEO);
    e.como(OTRO_DIMA);
    assert.equal(ok(e.llamar("cargaAbrir", CICLO, "ING")).modo, "edicion", "un bloqueo vencido no cuenta");
    assert.equal(e.hojas.Bloqueos.datos.length, 2, "reutiliza la fila vencida");
    e.como(DIRECTOR);
    assert.equal(ok(e.llamar("cargaAbrir", CICLO, "ING")).modo, "lectura");
    e.como(OTRO_DIMA);
    ok(e.llamar("cargaSalir", CICLO, "ING"));
    assert.equal(e.hojas.Bloqueos.datos.length, 1);
  });

  test("historial, ver una versión y restaurar (con A07 y A12)", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS, IND: { asignaturas: [asig("17.1.1.24", 1, 15, 15)] } }, docentes: DOCENTES_REGLAS });
    guardar(e, "ING", tp("R.1", "DOC CONTRATADO"));
    guardar(e, "ING", [...tp("R.2", "DOC ORDINARIO"), asg("ING|R.4|1", "T", "DOC ORDINARIO")]);
    const h = ok(e.llamar("cargaHistorial", CICLO, "ING")).versiones;
    assert.deepEqual(h.map(v => v.version + " " + v.usuario + " " + v.resumen), [
      "2 " + DIRECTOR + " 3 de 16 componentes con docente", "1 " + DIRECTOR + " 2 de 16 componentes con docente"]);
    const v1 = ok(e.llamar("cargaVersion", CICLO, "ING", 1));
    assert.deepEqual([v1.modo, v1.motivo, v1.version], ["lectura", "Versión 1 · solo lectura", 1]);
    assert.deepEqual(v1.secciones.find(s => s.clave === "ING|R.1|1").componentes.map(c => c.docente), ["DOC CONTRATADO", "DOC CONTRATADO"]);
    falla(e.llamar("cargaVersion", CICLO, "ING", 9), /^No existe la versión 9/);
    ok(e.llamar("cargaAbrir", CICLO, "ING"));
    const r = ok(e.llamar("cargaRestaurar", CICLO, "ING", 1));
    assert.equal(r.version, 3);
    assert.ok(Array.isArray(r.advertencias));
    assert.equal(e.hojas.Bloqueos.datos.length, 2, "quien restaura conserva su bloqueo");
    assert.match(ok(e.llamar("cargaHistorial", CICLO, "ING")).versiones[0].resumen, /^2 de 16 componentes con docente · restaura v1$/);
    assert.equal(JSON.parse(e.hojas.Cargas.datos[3][6]).restauradaDe, 1);
    ok(e.llamar("cargaSalir", CICLO, "ING"));
    /* A07: DOC ORDINARIO tiene ahora 30 h en IND; restaurar la v2 (22 h en ING) lo pasaría a 52 h. */
    assert.equal(guardar(e, "IND", [asg("IND|17.1.1.24|1", "T", "DOC ORDINARIO"), asg("IND|17.1.1.24|1", "P", "DOC ORDINARIO")]).guardado, true);
    falla(e.llamar("cargaRestaurar", CICLO, "ING", 2), /^No se puede restaurar la v2: DOC ORDINARIO\. Supera las 40 h lectivas \(52 h\)/);
    /* A12: la v4 tiene 26 h de un docente que después pasa a tener cargo; la v5 lo guarda con motivo. */
    guardar(e, "ING", [...tp("R.1", "DOC CONTRATADO"), ...tp("R.5", "DOC CONTRATADO")]);
    e.hojas.Docentes.datos.find(f => f[0] === "DOC CONTRATADO")[4] = "Director de escuela";
    assert.equal(guardar(e, "ING", [...tp("R.1", "DOC CONTRATADO"), ...tp("R.5", "DOC CONTRATADO")], "Plaza vacante").guardado, true);
    falla(e.llamar("cargaRestaurar", CICLO, "ING", 4), /^La v4 necesita un motivo \(A12\)/);
    const r6 = ok(e.llamar("cargaRestaurar", CICLO, "ING", 5));
    assert.equal(r6.version, 6);
    assert.equal(e.hojas.Cargas.datos.at(-1)[5], "Plaza vacante", "usa el motivo de la versión restaurada");
    assert.ok(r6.advertencias.some(a => a.codigo === "A12" && a.nivel === "motivo"));
  });

  test("huérfanas: asignaciones cuyo componente ya no está en el plan vigente", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    guardar(e, "ING", [...tp("R.3", "DOC A"), ...tp("R.1", "DOC B")]);
    ponerPlan(e, "ING", { asignaturas: PLAN_REGLAS.asignaturas.filter(a => a.codigo !== "R.3") }, 2);
    const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    assert.deepEqual([a.versionPlan, a.huerfanas.map(h => h.codigo + " " + h.comp + " " + h.docente + " " + h.horas)], [2, ["R.3 T DOC A 1", "R.3 P DOC A 1"]]);
    const i = ok(e.llamar("cargaInicio", CICLO)).carreras.find(c => c.sigla === "ING");
    assert.deepEqual([i.asignados, i.componentes], [2, 14]);
    const r = ok(e.llamar("cargaRestaurar", CICLO, "ING", 1));
    assert.match(r.advertencias[0].texto, /^Se descartaron 2 asignaciones que no corresponden a un componente del plan vigente/,
      "restaurar avisa de lo que ya no está en el plan");
    assert.deepEqual(JSON.parse(e.hojas.Cargas.datos.at(-1)[6]).asignaciones.map(a => a.clave + " " + a.comp), ["ING|R.1|1 T", "ING|R.1|1 P"]);
    ok(e.llamar("cargaSalir", CICLO, "ING"));
  });

  test("el contenido que no cabe en una celda falla antes de escribir", () => {
    const plan = { asignaturas: Array.from({ length: 300 }, (_, i) => asig("L." + i, 1 + (i % 10), 2, 2)) };
    const e = entorno({ planes: { ING: plan } });
    ok(e.llamar("cargaAbrir", CICLO, "ING"));
    const lista = plan.asignaturas.flatMap((a, i) => ["T", "P"].map(c => asg("ING|" + a.codigo + "|1", c, ("DOCENTE " + i + c + " ").padEnd(120, "X"))));
    falla(e.llamar("cargaGuardar", CICLO, "ING", lista, 0, ""), /^La carga no cabe en una celda \(\d+ de 50000 caracteres\)/);
    assert.equal(e.hojas.Cargas.datos.length, 1);
    ok(e.llamar("cargaMantener", CICLO, "ING"));
  });

  /* ---------- búsqueda ---------- */

  test("buscar docentes: tildes, todas las palabras, ≥ 2 letras, máximo 30, horas y carreras", () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ["PRUEBA DOCENTE " + String(i).padStart(2, "0"), "DIMA", "Contratado", "TP"]);
    const e = entorno({ planes: { ING: PLAN_REGLAS, IND: { asignaturas: [asig("17.1.1.24", 1, 3, 2)] } }, docentes: [...hojasBase().Docentes.slice(1), ...muchos] });
    const buscar = t => ok(e.llamar("cargaBuscarDocentes", CICLO, t));
    assert.deepEqual(buscar("chavez").resultados.map(r => r.docente), ["CHÁVEZ CONTRERAS ÁNGEL EVARISTO"]);
    assert.deepEqual(buscar("ÁNGEL  chávez").resultados.map(r => r.docente), ["CHÁVEZ CONTRERAS ÁNGEL EVARISTO"]);
    assert.deepEqual(buscar("chavez pedro").resultados, []);
    assert.deepEqual(buscar("lutgens").resultados.map(r => r.docente), ["LÜTGENS ZERECEDA CÉSAR ADOLFO"]);
    for (const t of ["a", "1 2", "  ", "", null]) falla(e.llamar("cargaBuscarDocentes", CICLO, t), /^Escribe al menos 2 letras$/);
    const p = buscar("prueba docente");
    assert.deepEqual([p.resultados.length, p.total, p.resultados[0].docente, p.resultados[29].docente], [30, 40, "PRUEBA DOCENTE 00", "PRUEBA DOCENTE 29"]);
    guardar(e, "ING", [...tp("R.5", "ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN"), ...tp("R.1", "Docente Sin Catalogo")]);
    guardar(e, "IND", [asg("IND|17.1.1.24|1", "T", "zegarra mejia milagros rocio del carmen")]);
    const z = buscar("zegarra milagros").resultados;
    assert.deepEqual(copia(z), [{ docente: "ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN", departamento: "DIMA", horas: 9, carreras: ["ING", "IND"] }]);
    assert.deepEqual(copia(buscar("sin catalogo").resultados), [{ docente: "Docente Sin Catalogo", departamento: "", horas: 20, carreras: ["ING"] }]);
    e.como(COORDINADOR);
    assert.equal(buscar("zegarra").resultados.length, 1, "cualquier rol puede buscar");
  });

  /* ---------- componente Alpine de la vista ---------- */

  test("vista: ocupado vuelve a \"\" tras éxito y error; x-for con datos del servidor", async () => {
    const e = entorno({ planes: { ING: planDesdeExcel("Ing. Software", "ING") } });
    const c = componente(e);
    c.ciclo = "1999-1";
    const p = c.inicio();
    assert.equal(c.ocupado, "inicio");
    await p;
    assert.deepEqual([c.ocupado, c.listo], ["", false]);
    assert.match(c.error, /^Ciclo desconocido/);
    c.ciclo = CICLO;
    await c.inicio();
    assert.deepEqual([c.ocupado, c.error, c.listo, c.carreras.length], ["", "", true, 8]);
    const abrir = c.abrir("ING");
    assert.deepEqual([c.ocupado, c.pedida], ["abrir", "ING"]);
    await abrir;
    assert.deepEqual([c.ocupado, c.doc.modo, c.editable(), c.puede(), c.reloj], ["", "edicion", true, true, 7]);
    c.masivo.texto = aTsv(hojaEjemplo("CargaXDepartamento", "CARGA DIMA 2026-I"));
    const interpretar = c.interpretar();
    assert.equal(c.ocupado, "interpretar");
    await interpretar;
    assert.equal(c.error, "");
    assert.equal(c.masivo.resultado.asignaciones.length, 104);
    assert.equal(c.aplicar(), 104);
    assert.deepEqual([c.masivo.resultado, c.cambios, c.actividad], [null, true, true]);
    assert.equal(c.doc.secciones.find(s => s.clave === "ING|3.5.5.24|1").componentes[0].docente, "VELASQUEZ DOIG MIGUEL EDUARDO");
    assert.equal(c.asignaciones().length, 104);
    c.busqueda = "zegarra";
    await c.buscarDocentes();
    assert.equal(c.resultados[0].docente, "ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN");
    c.enfocado = c.doc.secciones[1].componentes[0];
    c.usar(c.resultados[0]);
    assert.deepEqual([c.elegido, c.doc.secciones[1].componentes[0].docente], ["ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN", "ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN"]);
    c.busqueda = "z";
    await c.buscarDocentes();
    assert.deepEqual([c.ocupado, c.resultados.length, c.error], ["", 0, "Escribe al menos 2 letras"]);
    const guardar = c.guardar();
    assert.equal(c.ocupado, "guardar");
    await c.buscarDocentes();
    assert.equal(c.ocupado, "guardar", "otra llamada durante el guardado no hace nada ni rehabilita los botones");
    await guardar;
    assert.deepEqual([c.ocupado, c.doc, c.exito], ["", null, "Guardado como v1"]);
    assert.ok(c.advertencias.some(a => a.codigo === "A13"), "las advertencias quedan visibles en la tabla de carreras");
    assert.equal(c.carreras.find(x => x.sigla === "ING").version, 1);
  });

  test("vista: motivo A12, bloqueo perdido, historial / ver / volver / restaurar y archivo .csv", async () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS }, docentes: DOCENTES_REGLAS });
    const c = componente(e);
    c.ciclo = CICLO;
    await c.inicio();
    await c.abrir("ING");
    const poner = (clave, comp, d) => { c.doc.secciones.find(s => s.clave === clave).componentes.find(x => x.comp === comp).docente = d; };
    ["T", "P"].forEach(k => { poner("ING|R.1|1", k, "DOC CARGO"); poner("ING|R.5|1", k, "DOC CARGO"); });
    await c.guardar();
    assert.deepEqual([c.requiereMotivo, c.doc.modo], [true, "edicion"]);
    assert.match(c.error, /^Falta el motivo \(A12\)/);
    c.motivo = "Reemplazo temporal";
    await c.guardar();
    assert.deepEqual([c.exito, c.doc], ["Guardado como v1", null]);
    await c.abrir("ING");
    await c.historial();
    assert.deepEqual(copia(c.versiones.map(v => v.version)), [1]);
    await c.version(1);
    assert.deepEqual([c.vistaVersion, c.editable(), c.doc.motivo, c.anterior.modo], [1, false, "Versión 1 · solo lectura", "edicion"]);
    c.volver();
    assert.deepEqual([c.vistaVersion, c.editable(), c.anterior], [0, true, null]);
    await c.restaurar(1);
    assert.match(c.exito, /^Se restauró la v1 como v2/);
    assert.deepEqual([c.doc.version, c.doc.modo], [2, "edicion"]);
    await c.leerArchivo({ target: { files: [{ name: "carga.xlsx" }], value: "x" } });
    assert.equal(c.error, "Solo se aceptan archivos .csv; para .xlsx copia el rango y pégalo");
    const ansi = Buffer.from("DOCENTE;CARRERA;SEMESTRE;CODIGO;ASIGNATURA;HT;HP\r\nDOC PARCIAL;ING;3;R.3;Lógica;1;1\r\n", "latin1");
    const evento = { target: { files: [{ name: "carga.CSV", arrayBuffer: async () => ansi.buffer.slice(ansi.byteOffset, ansi.byteOffset + ansi.length) }], value: "x" } };
    await c.leerArchivo(evento);
    assert.deepEqual([c.masivo.texto.includes("Lógica"), c.masivo.resultado.asignaciones.length, evento.target.value], [true, 2, ""]);
    c.masivo.texto = "texto sin cabeceras";
    await c.interpretar();
    assert.deepEqual([c.masivo.resultado, c.ocupado], [null, ""], "si falla, no queda la previsualización anterior");
    assert.match(c.error, /^No encontré la fila de cabeceras/);
    c.masivo.texto = "x";
    c.descartar();
    assert.equal(c.masivo.resultado, null);
    e.avanzar(31 * 60000);
    await c.mantener();
    assert.equal(c.doc, null, "sale del modo edición");
    assert.equal(c.error, "Tu bloqueo venció o lo tomó otra cuenta: lo que no guardaste se perdió.");
    await c.abrir("ING");
    e.avanzar(31 * 60000);
    await c.guardar();
    assert.deepEqual([c.doc, c.ocupado], [null, ""]);
    assert.match(c.error, SIN_BLOQUEO);
    await c.abrir("ING");
    c.cambios = true;
    await c.salir();
    assert.deepEqual([c.doc, e.hojas.Bloqueos.datos.length], [null, 1]);
  });
  /* ---------- Hoja ocupada, última fila de Bloqueos, formato de texto y pestaña faltante (como en CU-001) ---------- */

  test("candado ocupado: abrir, guardar, mantener, salir y restaurar responden \"La hoja está ocupada…\" sin escribir", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    const antes = JSON.stringify([e.hojas.Cargas.datos, e.hojas.Bloqueos.datos]);
    e.ctx.LockService.getScriptLock = () => ({ waitLock() { throw new Error("Lock timeout: another process was holding the lock for too long."); }, releaseLock() {} });
    for (const [fn, ...args] of [["cargaAbrir", CICLO, "ING"], ["cargaGuardar", CICLO, "ING", tp("R.1", "DOC A"), a.version, ""],
      ["cargaMantener", CICLO, "ING"], ["cargaSalir", CICLO, "ING"], ["cargaRestaurar", CICLO, "ING", 1]])
      falla(e.llamar(fn, ...args), /^La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos\.$/);
    assert.equal(JSON.stringify([e.hojas.Cargas.datos, e.hojas.Bloqueos.datos]), antes);
  });

  test("con una sola fila en Bloqueos (Google no deja borrarla), guardar y salir la vacían y sueltan el bloqueo", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    e.hojas.Bloqueos.maxFilas = e.hojas.Bloqueos.getLastRow();   /* cabecera + tu bloqueo, como tras mucho uso */
    const g = ok(e.llamar("cargaGuardar", CICLO, "ING", tp("R.1", "DOC A"), a.version, ""));
    assert.deepEqual([g.guardado, g.version, e.hojas.Cargas.getLastRow(), e.hojas.Bloqueos.getLastRow()], [true, 1, 2, 1],
      "guarda la versión y suelta el bloqueo vaciando la fila");
    ok(e.llamar("cargaAbrir", CICLO, "ING"));
    e.hojas.Bloqueos.maxFilas = e.hojas.Bloqueos.getLastRow();
    assert.deepEqual(ok(e.llamar("cargaSalir", CICLO, "ING")), {});
    assert.equal(e.hojas.Bloqueos.getLastRow(), 1);
  });

  test("las filas que se agregan a Bloqueos y Cargas quedan con formato de texto (@)", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    const a = ok(e.llamar("cargaAbrir", CICLO, "ING"));
    assert.ok(e.hojas.Bloqueos.conTexto.has(e.hojas.Bloqueos.getLastRow()), "bloqueo nuevo");
    ok(e.llamar("cargaGuardar", CICLO, "ING", tp("R.1", "DOC A"), a.version, ""));
    assert.ok(e.hojas.Cargas.conTexto.has(e.hojas.Cargas.getLastRow()), "versión guardada");
    ok(e.llamar("cargaRestaurar", CICLO, "ING", 1));
    assert.ok(e.hojas.Cargas.conTexto.has(e.hojas.Cargas.getLastRow()), "versión restaurada");
  });

  test("si falta una pestaña, el mensaje la nombra entre comillas, como en CU-001", () => {
    const e = entorno({ planes: { ING: PLAN_REGLAS } });
    delete e.hojas.Docentes;
    falla(e.llamar("cargaBuscarDocentes", CICLO, "perez"), /^Falta la pestaña "Docentes" en la hoja\.$/);
  });
});
