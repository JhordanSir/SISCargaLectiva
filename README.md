# SISCargaLectiva

Sistema web para planificar la **carga lectiva** de la Universidad La Salle (Arequipa): qué cursos y grupos abre cada carrera en un ciclo y qué docentes los dictan.

Hoy este proceso se lleva en varios Google Sheets separados, uno por carrera y otro por departamento, que hay que mantener sincronizados a mano. SISCargaLectiva los reemplaza por **un solo registro**: un libro de Google Sheets que se edita en la web o directamente en sus hojas. Los listados por departamento y por docente se generan a partir de ese registro.

## Estado del proyecto

🚧 **En curso:** integración de CU-001 y CU-002 por carrera en un libro de Google Sheets. El plan por fases y su avance están en [docs/plan/plan-carga-por-carrera.md](docs/plan/plan-carga-por-carrera.md).

| Fase del plan | Qué incluye | Estado |
|---|---|---|
| 0 | Decisiones (P110–P134) | Hecha |
| 1 | Dominio: docentes, horas, reglas A07–A13, fusiones entre carreras | Hecha |
| 2 | Proyecto vinculado al libro, hojas por ciclo, siembra desde los `.xlsx` | Hecha |
| 3 | Edición directa en la hoja: menú, disparador `onSheetEdit`, protecciones con el bloqueo | Pendiente |
| 4 | Web: grilla por carrera con docentes, vistas por departamento y por docente | Pendiente |
| 5 | Concurrencia y rendimiento | Pendiente |
| 6 | Cierre de la documentación | Pendiente |

## Qué hace hoy

- **Un libro para todos los ciclos.** Cada ciclo tiene una hoja por carrera con el formato de CargaXCarrera («Ing. Software 2026-I»), la hoja **General** con el catálogo de docentes y sus horas, y las hojas **CARGA {DPTO}** por departamento. Las hojas del sistema (`_SYS_*`) están ocultas y protegidas.
- **Siembra desde los Excel.** Los tres `.xlsx` de ejemplo se leen una vez, sin modificarlos, y llenan el ciclo 2026-1. Cada carrera queda *Registrado v1*. Las fusiones anotadas en OBSERVACIONES se convierten en fusiones del sistema, también entre carreras. Los docentes de la columna DOCENTE se vinculan con General, y quien no está en General se da de alta «por completar».
- **Reglas de carga docente.** A07 (más de 40 h), A08 (más de 16 h con tiempo completo en otra universidad) y A11 (dos cursos del mismo semestre, carrera y malla) impiden la asignación por cualquier vía. A09, A10, A12 y A13 solo advierten. Al sembrar 2026-1, A11 deja dos asignaturas pendientes.
- **Web (CU-001):** tablero, consulta, carga masiva, grilla por semestre (agregar grupos, desdoblar, fusionar), estados *Sin Iniciar → Borrador → Registrado*, versiones restaurables y bloqueo por carrera con expiración y autoguardado. Lo que se guarda en la web se escribe en la hoja de la carrera.
- **Edición a mano en la hoja.** Se ve en la web enseguida. `consolidarHoja` pasa esos cambios por las reglas y los guarda como versión; el menú del libro llega en la fase 3.

El detalle está en [requirements.md](docs/requerimientos/requirements.md) y en [CU-001](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md).

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Google Apps Script **vinculado al libro**: servidor en `.js` y página con HtmlService |
| Datos | El libro de Google Sheets: hojas de cada ciclo y hojas del sistema con usuarios, planes, versiones y bitácora |
| Acceso | Cuenta de Google del dominio `@ulasalle.edu.pe` |
| Despliegue | `clasp`, la herramienta de línea de comandos de Apps Script |

## Estructura del repositorio

```
.
├── AppScript/                        # Proyecto de Apps Script vinculado al libro (se sube con clasp)
│   ├── Principal.js                  # doGet: arma la página
│   ├── Planes.js, Bloqueos.js        # Tablero, guardado, versiones, consolidación de la hoja y bloqueo
│   ├── Libro.js, HojasLibro.js       # Hojas del sistema y lectura y escritura de las hojas de cada ciclo
│   ├── HojaCarrera.js                # Formato de las hojas: plan ↔ filas (puro, se prueba en node)
│   ├── Siembra.js, LectorXlsx.js     # Siembra de un ciclo desde los .xlsx
│   ├── Dominio.js, DominioCarga.js   # Plan de ciclo y carga docente, compartidos con el navegador
│   ├── Docentes.js                   # Balance de la carga docente y marcas de General
│   ├── Acceso.js, Config.js
│   ├── Index.html, App.html, Estilos.html
│   └── pruebas/                      # Pruebas y vista previa local (no se sube)
├── docs/
│   ├── plan/                         # Plan por fases y su avance
│   ├── CU/                           # Casos de uso en Markdown
│   ├── QA/Checklist.md               # Checklist de calidad para casos de uso
│   ├── archivos/                     # Excel reales (no se modifican) y casos de uso en .docx
│   ├── feedback/                     # Transcripciones de la clase y de las revisiones del docente
│   ├── requerimientos/               # requirements.md y la transcripción sobre la asignación docente
│   └── prototipo/                    # Prototipos anteriores, como referencia
├── compose.yml                       # Despliegue del prototipo en Python (Dokploy)
└── .env.example                      # Variables del prototipo en Python
```

## Puesta en marcha

Hace falta Node.js y `clasp` (`npm install -g @google/clasp`), con la sesión iniciada con la cuenta institucional que será dueña del libro (`clasp login`).

1. **Crear el libro y su proyecto vinculado.** Desde `AppScript/`, quita el `.clasp.json` del proyecto independiente anterior y crea uno nuevo vinculado a un libro nuevo. `clasp create-script` es el nombre en clasp 3; en clasp 2 es `clasp create`. Ese comando trae un `appsscript.json` por defecto: restaura el del repositorio antes de subir.
   ```bash
   cd AppScript
   rm .clasp.json
   clasp create-script --type sheets --title "SISCargaLectiva" --rootDir .
   git checkout -- appsscript.json
   clasp push --force
   ```
   Si `clasp` dejó un `Code.js` o `Código.js` por defecto, bórralo antes de `clasp push`.
2. **Instalar.** Abre el editor con `clasp open-script` (`clasp open` en clasp 2), elige la función `instalar` y pulsa **Ejecutar**, aceptando los permisos. Prepara las hojas del sistema y crea la carpeta **SISCargaLectiva · Excel de origen**. El registro de ejecución muestra los enlaces.
3. **Sembrar el ciclo.** Sube a esa carpeta `SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx`, `SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx` y `SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx` desde `docs/archivos/`. Deben quedar como `.xlsx`: si Drive convierte las subidas a Hoja de cálculo de Google, desactiva esa opción. Luego ejecuta `sembrarCiclo`, que siembra el ciclo de `SIS_CICLO_ACTUAL`.
4. **Compartir y proteger.** Comparte el libro como editor con las cuentas de `_SYS_USUARIOS` y ejecuta `protegerHojasCicloActual`. Así cada carrera la escriben sus Coordinadores y los Directores, y DOCENTE solo los Directores.
5. **Probar y publicar.** **Implementar → Probar implementaciones** da la URL de prueba. `clasp create-deployment -d "descripción"` (`clasp deploy` en clasp 2) crea una versión publicada; el manifiesto fija *Ejecutar como: yo* y *Acceso: cualquier usuario de ulasalle.edu.pe*.

### Configuración

Vive en las propiedades del script (**Configuración del proyecto → Propiedades del script**). `instalar()` crea las que falten.

| Propiedad | Valor por defecto | Para qué sirve |
|---|---|---|
| `SIS_LIBRO_ID` | La pone `instalar()` | Libro del sistema. |
| `SIS_CARPETA_XLSX` | La crea `instalar()` | Carpeta de Drive con los `.xlsx` para sembrar un ciclo. |
| `SIS_DOMINIO` | `ulasalle.edu.pe` | Dominio admitido. |
| `SIS_MINUTOS_BLOQUEO` | `30` | Minutos de inactividad antes de liberar el bloqueo de edición. |
| `SIS_MAX_SUBGRUPOS` | `5` | Máximo de subgrupos de un desdoble parcial. |
| `SIS_CICLOS` | `2026-1,2026-2,2027-1,2027-2` | Ciclos del selector. |
| `SIS_CICLO_ACTUAL` | `2026-1` | Ciclo que abre la página y el que siembra `sembrarCiclo`. |
| `SIS_ROL_POR_DEFECTO` | `ninguno` | Rol de una cuenta del dominio que no está en `_SYS_USUARIOS`: `ninguno` (acceso denegado), `director` o `coordinador`. |
| `SIS_REGLAS` | vacío | Umbrales de las reglas de carga docente en JSON, por ejemplo `{"A09": {"max": 26}}`. |

Los usuarios se gestionan en `_SYS_USUARIOS`, con cuatro columnas: `correo`, `rol` (`director` o `coordinador`), `carreras` (siglas separadas por comas, para coordinadores) y `departamento` (para directores: `DIMA`, `DAHUC`, `DACJ`, `DACTE` o `TODOS`). Un Director asigna docentes en las filas de su departamento; con `TODOS`, en cualquiera. `instalar()` siembra las cuentas del equipo como Director con `TODOS`. Un cambio en esa hoja tarda hasta 5 minutos en aplicarse, porque el rol de cada cuenta se guarda en caché. Después de cambiar las cuentas, ejecuta `protegerHojasCicloActual`.

### Probar sin Google

```bash
node --test AppScript/pruebas/*.test.mjs      # dominio, hojas, lector de .xlsx y servidor con servicios de Google simulados
node AppScript/pruebas/servidor-local.mjs     # vista previa en http://127.0.0.1:8765/?usuario=<correo>, con 2026-1 sembrado
node AppScript/pruebas/recorrido-ui.mjs       # recorrido de la interfaz en Chrome sin ventana (unos 2 minutos)
```

En Windows, el recorrido necesita la ruta de Chrome en la variable `CHROME`, por ejemplo `CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"`.

## Prototipos anteriores

Se conservan como referencia:

- `docs/prototipo/funcional/`: prototipo operativo en una sola página, con acceso por Google Identity Services y los datos en memoria. Se ejecuta con `python3 servir.py` y se despliega en Dokploy con `compose.yml`; su guía está en [docs/prototipo/funcional/README.md](docs/prototipo/funcional/README.md).
- `docs/prototipo/CU-001-Registrar-Plan-de-Ciclo.html`: cascarón de solo pantallas para recorrer el flujo básico y los flujos alternativos; se abre directamente en el navegador.

## Documentación

- [docs/plan/plan-carga-por-carrera.md](docs/plan/plan-carga-por-carrera.md): plan por fases, límites de Apps Script que condicionan el diseño y avance.
- [requirements.md](docs/requerimientos/requirements.md): requisitos funcionales y no funcionales, reglas de interpretación y de carga docente, plantilla de importación, hallazgos en los Excel, decisiones del equipo y preguntas abiertas.
- [docs/CU/CU-001-Registrar-Plan-de-Ciclo.md](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md): caso de uso del plan de ciclo (v5.0).
- [docs/QA/Checklist.md](docs/QA/Checklist.md): criterios que debe cumplir cada caso de uso.
