/* Vista previa local de la aplicación, sin Google: sirve Index.html tal como lo arma
   doGet() y sustituye google.script.run por llamadas a este servidor, que ejecuta el
   código de Apps Script con los servicios falsos de falsos.mjs.

     node AppScript/pruebas/servidor-local.mjs [puerto]
     http://127.0.0.1:8765/?usuario=mfloresl@ulasalle.edu.pe

   El parámetro «usuario» elige la cuenta; dos pestañas con cuentas distintas sirven
   para probar el bloqueo. Los datos viven en memoria mientras el proceso sigue vivo. */
import http from "node:http";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { crearEntorno, cargarServidor, ejecutar } from "./falsos.mjs";
import { XLSX_CARRERA, XLSX_DEPARTAMENTO } from "./soporte.mjs";

const USUARIO_POR_DEFECTO = "mfloresl@ulasalle.edu.pe";

const PUENTE = usuario => `<script>
(function () {
  var USUARIO = ${JSON.stringify(usuario)};
  window.__llamadas = [];
  function run(ok, mal) {
    return new Proxy({}, { get: function (_, nombre) {
      if (nombre === "withSuccessHandler") return function (f) { return run(f, mal); };
      if (nombre === "withFailureHandler") return function (f) { return run(ok, f); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        window.__llamadas.push(nombre);
        fetch("/run/" + nombre + "?usuario=" + encodeURIComponent(USUARIO), { method: "POST", body: JSON.stringify(args) })
          .then(function (r) { return r.json(); })
          .then(function (r) { if ("error" in r) { if (mal) mal(new Error(r.error)); } else if (ok) ok(r.valor); })
          .catch(function (e) { if (mal) mal(e); });
      };
    } });
  }
  window.google = { script: { run: run(null, null) } };
})();
</script>`;

export function iniciarServidorLocal({ puerto = 8765, conXlsx = true } = {}) {
  const e = crearEntorno();
  const ctx = cargarServidor(e);
  ejecutar(e, e.propietario, "instalar");
  if (conXlsx) {
    e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", fs.readFileSync(XLSX_CARRERA));
    e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", fs.readFileSync(XLSX_DEPARTAMENTO));
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const usuario = url.searchParams.get("usuario") || USUARIO_POR_DEFECTO;
    let cuerpo = "";
    req.on("data", d => { cuerpo += d; });
    req.on("end", () => {
      try {
        if (req.method === "GET" && url.pathname === "/") {
          e.usuario = usuario;
          ctx.configCache_ = null; ctx.libroBdCache_ = null; ctx.usuarioCache_ = null;
          const html = ctx.doGet().getContent().replace("<head>", "<head>" + PUENTE(usuario));
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          return res.end(html);
        }
        const m = url.pathname.match(/^\/run\/([A-Za-z]\w*)$/);
        if (req.method === "POST" && m) {
          /* Como google.script.run: solo funciones globales sin «_» final. */
          if (m[1].endsWith("_") || typeof ctx[m[1]] !== "function") throw new Error("Función no disponible: " + m[1]);
          const args = JSON.parse(cuerpo || "[]");
          let respuesta;
          try { respuesta = { valor: ejecutar(e, usuario, m[1], ...args) ?? null }; }
          catch (err) { respuesta = { error: err.message }; }
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify(respuesta));
        }
        res.writeHead(404); res.end();
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }); res.end(err.stack);
      }
    });
  });

  return new Promise(ok => servidor.listen(puerto, "127.0.0.1", () => ok({
    url: "http://127.0.0.1:" + servidor.address().port + "/",
    entorno: e,
    cerrar: () => new Promise(r => servidor.close(r))
  })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await iniciarServidorLocal({ puerto: Number(process.argv[2]) || 8765 });
  console.log("Vista previa en " + url + "?usuario=" + USUARIO_POR_DEFECTO);
}
