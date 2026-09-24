#!/usr/bin/env python3
"""
Sirve el prototipo funcional de CU-001 leyendo la configuración del archivo .env.

Google Identity Services exige un origen http(s): abrir index.html con doble clic
no funciona. Este servidor resuelve las dos cosas a la vez, porque además expone
las variables de .env a la página mediante /config.js.

    python3 servir.py            # http://localhost:8000
    python3 servir.py 8080       # otro puerto

Solo usa la biblioteca estándar. No escribe ningún archivo.
"""

import errno
import functools
import http.server
import json
import os
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent

# Variables que se envían al navegador. El resto del .env no se expone nunca:
# este archivo puede contener credenciales del backend.
EXPUESTAS = ("GOOGLE_CLIENT_ID", "SIS_DOMINIO")


def buscar_env(desde: Path):
    """Busca el primer .env en este directorio o en cualquiera de sus padres."""
    for carpeta in [desde, *desde.parents]:
        ruta = carpeta / ".env"
        if ruta.is_file():
            return ruta
    return None


def leer_env(ruta: Path):
    """Lee un .env sencillo: CLAVE=valor, con # para comentarios."""
    datos = {}
    if ruta is None:
        return datos
    for numero, linea in enumerate(ruta.read_text(encoding="utf-8").splitlines(), 1):
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        if "=" not in linea:
            print(f"  aviso: se ignora la línea {numero} de {ruta.name}: no tiene el formato CLAVE=valor")
            continue
        clave, valor = linea.split("=", 1)
        valor = valor.strip()
        if len(valor) >= 2 and valor[0] == valor[-1] and valor[0] in "\"'":
            valor = valor[1:-1]
        datos[clave.strip()] = valor
    return datos


class Manejador(http.server.SimpleHTTPRequestHandler):
    """Sirve el directorio del prototipo y sintetiza /config.js desde el .env."""

    configuracion = {}

    def do_GET(self):
        if self.path.split("?")[0].rstrip("/") == "/config.js":
            cuerpo = (
                "/* Generado por servir.py a partir de .env. No se versiona. */\n"
                "window.SISCONFIG = "
                + json.dumps(self.configuracion, ensure_ascii=False, indent=2)
                + ";\n"
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()          # añade Cache-Control: no-store
            self.wfile.write(cuerpo)
            return
        super().do_GET()

    def end_headers(self):
        # Evita que el navegador sirva una versión cacheada mientras se prueba.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def handle_one_request(self):
        # Un navegador que cancela la carga, o un proxy que cierra la conexion,
        # aborta la escritura. No es un fallo del servidor: se ignora en vez de
        # dejar que socketserver imprima un traceback por cada uno.
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError):
            self.close_connection = True

    def log_message(self, formato, *args):
        # En los errores, el primer argumento es un HTTPStatus, no una cadena.
        primero = str(args[0]) if args else ""
        if "/config.js" in primero:
            return
        super().log_message(formato, *args)


def main():
    puerto = 8000
    if len(sys.argv) > 1:
        try:
            puerto = int(sys.argv[1])
        except ValueError:
            sys.exit(f"Puerto no válido: {sys.argv[1]!r}")

    ruta_env = buscar_env(DIR)
    entorno = leer_env(ruta_env)

    # Las variables del sistema tienen prioridad sobre el archivo.
    valores = {c: os.environ.get(c, entorno.get(c, "")) for c in EXPUESTAS}
    if ruta_env:
        valores["_archivo"] = str(ruta_env)

    puerto_env = os.environ.get("SIS_PUERTO", entorno.get("SIS_PUERTO", ""))
    if len(sys.argv) == 1 and puerto_env.isdigit():
        puerto = int(puerto_env)

    # Por defecto solo escucha en el equipo local. En un contenedor hace falta
    # 0.0.0.0 para que el puerto publicado sea alcanzable desde fuera.
    direccion = os.environ.get("SIS_BIND", entorno.get("SIS_BIND", "127.0.0.1"))

    origen = f"http://localhost:{puerto}"

    print()
    print("  SISCargaLectiva · prototipo funcional de CU-001")
    print("  " + "-" * 58)
    print(f"  .env             {ruta_env if ruta_env else 'no encontrado'}")
    cid = valores.get("GOOGLE_CLIENT_ID", "")
    if cid:
        visible = cid if len(cid) <= 26 else cid[:14] + "…" + cid[-12:]
        print(f"  GOOGLE_CLIENT_ID {visible}")
    else:
        print("  GOOGLE_CLIENT_ID (sin definir)")
    print(f"  Dominio          {valores.get('SIS_DOMINIO') or 'ulasalle.edu.pe (por defecto)'}")
    print(f"  Dirección        {origen}")
    if direccion != "127.0.0.1":
        print(f"  Escuchando en    {direccion}:{puerto}")
    print()
    if not cid:
        print("  Falta GOOGLE_CLIENT_ID: la aplicación abrirá la pantalla de configuración.")
        if not ruta_env:
            print("  Copia .env.example a .env en la raíz del repositorio y rellénalo.")
        print()
    print(f"  Registra este origen exacto en Google Cloud: {origen}")
    print("  Ctrl+C para detener.")
    print(flush=True)

    Manejador.configuracion = valores
    manejador = functools.partial(Manejador, directory=str(DIR))

    try:
        # Un hilo por peticion: la pagina pide varios archivos a la vez y un
        # servidor secuencial los encolaria.
        with http.server.ThreadingHTTPServer((direccion, puerto), manejador) as httpd:
            httpd.serve_forever()
    except OSError as e:
        if e.errno == errno.EADDRINUSE:
            sys.exit(f"El puerto {puerto} está ocupado. Prueba con: python3 servir.py {puerto + 1}")
        raise
    except KeyboardInterrupt:
        print("\n  Servidor detenido.\n")


if __name__ == "__main__":
    main()
