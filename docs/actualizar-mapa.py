"""Vuelve a copiar el código de AppScript/ dentro de docs/mapa-interactivo.html.

El mapa no tiene números de línea escritos a mano: al abrirse, lee el código copiado en la página
(bloque <script id="fuentes">) y de ahí saca cada función, sus comentarios «PASO 1 ·», «8a ·», «A07 ·»
y las marcas 📥 📤 🗑 🔒 de lectura y escritura del Sheet. Después de cambiar el código, ejecuta desde
la raíz del repositorio:

    python3 docs/actualizar-mapa.py

Si un botón o una pregunta del mapa apunta a algo que ya no existe (un método renombrado, un PASO que
desapareció), la consola del navegador avisa con «Mapa: No encontré …».
"""
import json
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PAGINA = RAIZ / "docs" / "mapa-interactivo.html"
ARCHIVOS = {
    "IV": "AppScript/IndexVista.html", "IJ": "AppScript/Index.js", "INI": "AppScript/InicioVista.html",
    "PV": "AppScript/PlanDeCicloVista.html", "PJ": "AppScript/PlanDeCiclo.js",
    "CV": "AppScript/CargaDocenteVista.html", "CJ": "AppScript/CargaDocente.js", "MF": "AppScript/appsscript.json",
    "CL": "AppScript/.clasp.json", "CI": "AppScript/.claspignore",
}

fuentes = {k: (RAIZ / v).read_text(encoding="utf-8") for k, v in ARCHIVOS.items()}
# «<» como <: así el texto nunca puede cerrar ni confundir el <script> que lo contiene.
datos = json.dumps(fuentes, ensure_ascii=False).replace("<", "\\u003c")
html = PAGINA.read_text(encoding="utf-8")
nuevo, n = re.subn(r'(<script type="application/json" id="fuentes">).*?(</script>)',
                   lambda m: m.group(1) + datos + m.group(2), html, count=1, flags=re.S)
if n != 1:
    raise SystemExit("No encontré el bloque <script id=\"fuentes\"> en " + str(PAGINA))
PAGINA.write_text(nuevo, encoding="utf-8")
print("Actualizado:", PAGINA.relative_to(RAIZ), "·", ", ".join(ARCHIVOS.values()))
