#!/usr/bin/env python3
"""
Lint determinístico para casos de uso de SISCargaLectiva.

Comprueba, de forma mecánica, una parte de docs/QA/Checklist.md:
  - Términos ambiguos prohibidos.
  - Secciones de la plantilla ausentes o vacías.
  - Identificadores (FA-0XX, RN-##, E##, A##) duplicados.
  - Referencias "paso N del flujo básico / FA-0XX" que apuntan a un paso
    que no existe.

No reemplaza la lectura humana: no evalúa modularidad, duplicidad de
lógica, nivel de detalle ni redacción — eso lo hace quien usa esta skill,
apoyándose en references/guia-cu.md.

Uso:
    python lint_cu.py <ruta-al-CU.md>

Salida: texto con una sección por tipo de problema y un resumen final.
El código de salida es 0 siempre (es una ayuda, no un gate que bloquee);
quien lo invoca decide qué hacer con los hallazgos.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

TERMINOS_AMBIGUOS = [
    "etc.",
    "etc,",
    " etcétera",
    "aproximadamente",
    "posiblemente",
    "si es necesario",
    "si fuera necesario",
    "rango admitido",
    "y otros,",
    "y otras,",
    "entre otros",
    "entre otras",
]

# Secciones que debe tener cualquier CU. La clave es lo que se busca
# (regex sobre el encabezado), el valor es el texto legible para reportar.
# Nota: no incluye Postcondiciones — se retiró de la plantilla obligatoria
# en preguntas.md P78 (su contenido ya queda cubierto por los últimos pasos
# del flujo básico), y por eso el Glosario pasó a ser la sección 1.4.
SECCIONES_REQUERIDAS = [
    (r"^#+\s*1\.\s*Datos generales", "1. Datos generales del caso de uso"),
    (r"^#+\s*1\.1\s*Breve descripci[oó]n", "1.1 Breve descripción del caso de uso"),
    (r"^#+\s*1\.2\s*Actores", "1.2 Actores del caso de uso"),
    (r"^#+\s*1\.3\s*Precondiciones", "1.3 Precondiciones"),
    (r"^#+\s*1\.4\s*Glosario", "1.4 Glosario de términos"),
    (r"^#+\s*2\.1\s*Flujo b[aá]sico", "2.1 Flujo básico"),
    (r"^#+\s*2\.2\s*Flujos alternativos", "2.2 Flujos alternativos"),
    (r"^#+\s*4\.\s*Requisitos especiales", "4. Requisitos especiales"),
    (r"^#+\s*6\.\s*Resumen funcional", "6. Resumen funcional"),
]

RE_ENCABEZADO = re.compile(r"^(#{1,6})\s+(.*)$")
RE_FA_DEF = re.compile(r"^#{1,6}\s*(FA-\d{3}):")
RE_ID_EN_TEXTO = re.compile(r"\b(FA-\d{3}|RN-\d{2}|E\d{2}|A\d{2})\b")
RE_PASO_FLUJO_BASICO = re.compile(r"paso\s+(\d+)\s+del\s+flujo\s+b[aá]sico", re.IGNORECASE)
RE_PASO_FA = re.compile(r"paso\s+(\d+)\s+del\s+(FA-\d{3})", re.IGNORECASE)
RE_FILA_TABLA_PASO = re.compile(r"^\|\s*(\d+)\s*\|")
RE_PASO_LISTA_FA = re.compile(r"^\d+\.\s+(.*)$")
RE_CONJUNCION = re.compile(r"\b[yo]\b", re.IGNORECASE)


def cargar(ruta: Path) -> list[str]:
    return ruta.read_text(encoding="utf-8").splitlines()


def revisar_terminos_ambiguos(lineas: list[str]) -> list[tuple[int, str, str]]:
    hallazgos = []
    for i, linea in enumerate(lineas, start=1):
        baja = linea.lower()
        for termino in TERMINOS_AMBIGUOS:
            if termino.lower() in baja:
                hallazgos.append((i, termino.strip(","), linea.strip()))
    return hallazgos


def revisar_secciones(lineas: list[str]) -> tuple[list[str], list[str]]:
    texto_encabezados = [l for l in lineas if RE_ENCABEZADO.match(l)]
    ausentes = []
    vacias = []
    for patron, nombre in SECCIONES_REQUERIDAS:
        idx = next(
            (i for i, l in enumerate(lineas) if re.match(patron, l.strip(), re.IGNORECASE)),
            None,
        )
        if idx is None:
            ausentes.append(nombre)
            continue
        # Busca la siguiente línea con contenido real antes del próximo encabezado.
        nivel_actual = RE_ENCABEZADO.match(lineas[idx].strip()).group(1)
        j = idx + 1
        tiene_contenido = False
        while j < len(lineas):
            l = lineas[j].strip()
            m = RE_ENCABEZADO.match(l)
            if m and len(m.group(1)) <= len(nivel_actual):
                break
            if l and l != "---":
                tiene_contenido = True
                break
            j += 1
        if not tiene_contenido:
            vacias.append(nombre)
    return ausentes, vacias


def revisar_ids_duplicados(lineas: list[str]) -> dict[str, list[int]]:
    """Solo cuenta como 'definición' un ID que encabeza su propia fila/sección
    (### FA-0XX: ..., o una fila de tabla '| RN-01 | ...'), no cada mención."""
    definiciones: dict[str, list[int]] = defaultdict(list)
    for i, linea in enumerate(lineas, start=1):
        l = linea.strip()
        m_fa = RE_FA_DEF.match(l)
        if m_fa:
            definiciones[m_fa.group(1)].append(i)
            continue
        m_tabla = re.match(r"^\|\s*(RN-\d{2}|E\d{2}|A\d{2})\s*\|", l)
        if m_tabla:
            definiciones[m_tabla.group(1)].append(i)
    return {k: v for k, v in definiciones.items() if len(v) > 1}


def contar_pasos_flujo_basico(lineas: list[str]) -> int:
    en_flujo_basico = False
    max_paso = 0
    for linea in lineas:
        l = linea.strip()
        if re.match(r"^#+\s*2\.1\s*Flujo b[aá]sico", l, re.IGNORECASE):
            en_flujo_basico = True
            continue
        if en_flujo_basico and RE_ENCABEZADO.match(l):
            break
        if en_flujo_basico:
            m = RE_FILA_TABLA_PASO.match(l)
            if m:
                max_paso = max(max_paso, int(m.group(1)))
    return max_paso


def contar_pasos_por_fa(lineas: list[str]) -> dict[str, int]:
    pasos_por_fa: dict[str, int] = {}
    fa_actual = None
    contador = 0
    for linea in lineas:
        l = linea.strip()
        m_fa = RE_FA_DEF.match(l)
        if m_fa:
            if fa_actual:
                pasos_por_fa[fa_actual] = contador
            fa_actual = m_fa.group(1)
            contador = 0
            continue
        if fa_actual and re.match(r"^\d+\.\s", l):
            contador += 1
    if fa_actual:
        pasos_por_fa[fa_actual] = contador
    return pasos_por_fa


def revisar_conjunciones_en_pasos(lineas: list[str]) -> list[tuple[int, str]]:
    """Candidatos a revisar manualmente: 'y'/'o' sueltos dentro de un paso del
    flujo básico o de un FA. Esto es SOLO un aviso, no un fallo — un paso
    legítimamente puede tener 'y'/'o' cuando:
      - un solo verbo se aplica a dos objetos ("la fila y la celda"),
      - describe una condición de dos valores ("HT o HP", "igual o mayor"),
      - cita un término compuesto fijo ("Fecha y Hora"), o
      - enumera alternativas de disparo de un mismo FA ("el paso 4 o 5").
    Lo que sí es una violación real (y esto no lo distingue automáticamente):
    unir dos ACCIONES distintas en un paso, o enumerar en línea una lista que
    el sistema muestra en pantalla (eso va en guiones o entre paréntesis).
    Por eso esta función solo reporta candidatos; el juicio final es de quien
    usa la skill, apoyado en references/guia-cu.md.
    """
    en_flujo_basico = False
    en_fa = False
    candidatos = []
    for i, linea in enumerate(lineas, start=1):
        l = linea.strip()
        if re.match(r"^#+\s*2\.1\s*Flujo b[aá]sico", l, re.IGNORECASE):
            en_flujo_basico = True
            continue
        if re.match(r"^#+\s*2\.2\s*Flujos alternativos", l, re.IGNORECASE):
            en_flujo_basico = False
            en_fa = True
            continue
        if re.match(r"^#+\s*3\.", l) or re.match(r"^##\s*3\b", l):
            en_fa = False
        if en_flujo_basico:
            m = RE_FILA_TABLA_PASO.match(l)
            if m:
                celdas = [c.strip() for c in l.strip("|").split("|")]
                if len(celdas) >= 3 and RE_CONJUNCION.search(celdas[2]):
                    candidatos.append((i, celdas[2]))
        elif en_fa:
            m = RE_PASO_LISTA_FA.match(l)
            if m and RE_CONJUNCION.search(m.group(1)):
                candidatos.append((i, l))
    return candidatos


def revisar_referencias_de_paso(
    lineas: list[str], total_basico: int, pasos_por_fa: dict[str, int]
) -> list[tuple[int, str]]:
    problemas = []
    for i, linea in enumerate(lineas, start=1):
        for m in RE_PASO_FLUJO_BASICO.finditer(linea):
            n = int(m.group(1))
            if total_basico and n > total_basico:
                problemas.append(
                    (i, f"referencia a 'paso {n} del flujo básico', pero el flujo básico solo tiene {total_basico} pasos")
                )
        for m in RE_PASO_FA.finditer(linea):
            n, fa = int(m.group(1)), m.group(2)
            total_fa = pasos_por_fa.get(fa)
            if total_fa is None:
                problemas.append((i, f"referencia a '{fa}', pero ese identificador no está definido en este documento"))
            elif n > total_fa:
                problemas.append(
                    (i, f"referencia a 'paso {n} del {fa}', pero {fa} solo tiene {total_fa} pasos")
                )
    return problemas


def main() -> int:
    # En consolas de Windows (cp1252/cp850) los acentos y "ó/í" se ven mal
    # si no se fuerza UTF-8 explícitamente; el contenido del archivo no se
    # ve afectado, solo lo que se imprime en pantalla.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except (ValueError, AttributeError):
                pass

    if len(sys.argv) != 2:
        print("Uso: python lint_cu.py <ruta-al-CU.md>", file=sys.stderr)
        return 2

    ruta = Path(sys.argv[1])
    if not ruta.exists():
        print(f"No existe el archivo: {ruta}", file=sys.stderr)
        return 2

    lineas = cargar(ruta)
    print(f"Lint de {ruta}\n{'=' * 60}")

    # 1. Términos ambiguos
    ambiguos = revisar_terminos_ambiguos(lineas)
    print(f"\n[Términos ambiguos] {len(ambiguos)} hallazgo(s)")
    for linea_num, termino, contexto in ambiguos:
        print(f"  L{linea_num}: '{termino}' → {contexto[:100]}")

    # 2. Secciones ausentes o vacías
    ausentes, vacias = revisar_secciones(lineas)
    print(f"\n[Secciones ausentes] {len(ausentes)}")
    for nombre in ausentes:
        print(f"  falta: {nombre}")
    print(f"\n[Secciones vacías] {len(vacias)} (¿deberían decir 'Ninguno' o 'No aplica'?)")
    for nombre in vacias:
        print(f"  vacía: {nombre}")

    # 3. IDs duplicados
    duplicados = revisar_ids_duplicados(lineas)
    print(f"\n[Identificadores duplicados] {len(duplicados)}")
    for id_, ocurrencias in duplicados.items():
        print(f"  {id_} definido en las líneas: {', '.join(map(str, ocurrencias))}")

    # 4. Referencias de paso inválidas
    total_basico = contar_pasos_flujo_basico(lineas)
    pasos_por_fa = contar_pasos_por_fa(lineas)
    problemas_ref = revisar_referencias_de_paso(lineas, total_basico, pasos_por_fa)
    print(f"\n[Referencias a pasos inexistentes] {len(problemas_ref)}")
    print(f"  (flujo básico detectado con {total_basico} pasos; {len(pasos_por_fa)} FA detectados)")
    for linea_num, msg in problemas_ref:
        print(f"  L{linea_num}: {msg}")

    # 5. Candidatos a revisar: 'y'/'o' dentro de un paso (solo aviso, ver docstring)
    candidatos_conjuncion = revisar_conjunciones_en_pasos(lineas)
    print(f"\n[Candidatos a revisar: 'y'/'o' dentro de un paso] {len(candidatos_conjuncion)}")
    print("  (aviso, no fallo — la mayoría son válidos: un verbo con dos objetos,")
    print("   una condición de dos valores o un término compuesto fijo. Solo es un")
    print("   problema real si une dos acciones distintas, o si enumera en línea")
    print("   algo que el sistema muestra en pantalla; ver references/guia-cu.md)")
    for linea_num, contexto in candidatos_conjuncion:
        print(f"  L{linea_num}: {contexto[:110]}")

    total = len(ambiguos) + len(ausentes) + len(vacias) + len(duplicados) + len(problemas_ref)
    print(f"\n{'=' * 60}")
    if total == 0:
        print("Sin hallazgos mecánicos. Falta igual la revisión de criterios de Fondo (ver references/guia-cu.md).")
    else:
        print(f"{total} hallazgo(s) en total. Revisa cada uno — puede haber falsos positivos (p. ej. una cita textual del docente).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
