# SISCargaLectiva

Sistema web para planificar la **carga lectiva** de la Universidad La Salle (Arequipa): qué cursos y grupos abre cada carrera en un ciclo y qué docentes los dictan.

Hoy este proceso se lleva en varios Google Sheets separados, uno por carrera y otro por departamento, que hay que mantener sincronizados a mano. SISCargaLectiva los reemplaza por **un solo registro**. Los listados por carrera, por departamento y por docente pasan a ser reportes generados desde ese registro.

## Estado del proyecto

🚧 `AppScript/` es el **proyecto de Google Apps Script de la hoja del sistema** que está en script.google.com: una aplicación web con CU-001 y un prototipo de CU-002. Su interfaz se rediseñó el 2026-10-15 con los colores de La Salle, en módulos por pantalla y con Tailwind compilado (P149–P151). script.google.com tendrá el rediseño después del próximo `clasp push`.

| Caso de uso | Estado en `AppScript/` |
|---|---|
| CU-001 Registrar plan de ciclo | Implementado |
| CU-002 Asignar docentes a plan de ciclo | Prototipo |

Este código es del 2026-10-08 (commit `3947d8b`), anterior a las decisiones P110–P144. El 2026-10-14 se retiraron de `AppScript/` las fases 1 a 3 del [plan por carrera](docs/plan/plan-carga-por-carrera.md), que estaban en el commit `035c873`: el libro vinculado, las hojas por carrera, la edición en la hoja, el menú y el panel lateral. El plan, [requirements.md](docs/requerimientos/requirements.md) y [CU-001 v6.0](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md) siguen describiendo ese diseño.

## Qué hace hoy

El **Coordinador de carrera** (en sus carreras) o el **Director de departamento** (en cualquier carrera) registra el plan de ciclo de una carrera:

- **Los Excel son la fuente de datos.** La oferta de 2026-1 se lee de los `.xlsx` de una carpeta de Google Drive, sin convertirlos, y cada carrera arranca como *Registrado v1*. Si el Excel cambia, cada plan afectado recibe una versión nueva. Los `.xlsx` nunca se modifican. La carpeta se revisa como mucho cada 5 minutos; el botón **Releer Excel** del tablero la revisa en el momento.
- **Carga masiva:** se pega desde Google Sheets o se sube un `.xlsx` o `.csv`. El sistema no valida: interpreta lo que recibe y nunca rechaza una carga (CU-001 v4.0). Solo toma las filas de la carrera del plan.
- **Grilla por semestre** para editar horas, asignaturas y grupos: agregar grupos, desdoblar la práctica o la teoría y fusionar grupos del plan, siempre con aviso y sin bloquear.
- **Estados** Sin Iniciar → Borrador → Registrado. Un plan Registrado sigue siendo editable y **cada guardado genera una versión**, que se puede restaurar.
- **Tablero** con el avance de todas las carreras del ciclo.
- **Bloqueo de edición** por carrera, con expiración y autoguardado.

**Asignación docente (prototipo de CU-002).** La sección «Asignar docentes al plan de ciclo» lista, por ciclo y departamento, las asignaturas de los planes del ciclo. A esas asignaturas se les asignan docentes del catálogo de `CargaDeDocentes.xlsx`. Las asignaciones se guardan en la pestaña Asignaciones, con un bloqueo por departamento. El balance de horas de cada docente muestra las advertencias A07 a A13.

**Interfaz.** Una cabecera fija con el logotipo de La Salle lleva a Inicio, Registrar plan de ciclo y Asignar docentes, y el pie muestra «Powered by Wayrasimi S.A.C.S.».

- **Entre secciones:** el ciclo elegido se comparte, lo ya leído no se vuelve a pedir y las asignaciones sin guardar se conservan al ir y volver.
- **Entre pestañas del navegador:** las pestañas con la aplicación abierta se avisan entre sí cuando una toma o suelta el bloqueo de un plan, guarda una versión, relee los Excel o guarda asignaciones.
- **Al esperar al servidor:** se muestra la espera «Wayrasiming».
- **Modo claro y oscuro:** según la configuración del sistema.

El detalle está en [requirements.md](docs/requerimientos/requirements.md) y en [CU-001](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md).

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Google Apps Script: servidor en `.js` y página con HtmlService |
| Interfaz | Una carpeta por pantalla con su HTML y su servidor; Alpine.js 3 para la navegación, los botones en espera y las tablas que llenan las respuestas del servidor; Tailwind CSS 4 compilado con su CLI. Alpine, Tailwind y los íconos Phosphor van incrustados en la página (sin CDN) |
| Datos | Los `.xlsx` de una carpeta de Google Drive (fuente, solo lectura) y una hoja de cálculo de Google, «SISCargaLectiva-BD», con los planes, las versiones, los bloqueos, los usuarios y las asignaciones docentes |
| Acceso | Cuenta de Google del dominio `@ulasalle.edu.pe` |
| Despliegue | `clasp`, la herramienta de línea de comandos de Apps Script |

## Estructura del repositorio

```
.
├── AppScript/                        # Proyecto de Apps Script de la hoja del sistema (se sube con clasp)
│   ├── Index.html, IndexServidor.js  # La página (cabecera, pie, include() de cada pantalla) y doGet
│   ├── inicio/Inicio.html            # Pantalla de inicio, acceso denegado y «sin instalar»
│   ├── cu001/                        # CU-001 Registrar plan de ciclo
│   │   ├── vistas/                   # Una carpeta por pantalla: sus .html y los …Servidor.js que la atienden
│   │   │   ├── tablero/              # Tablero.html ↔ TableroServidor.js
│   │   │   ├── consulta/             # Consulta.html ↔ ConsultaServidor.js
│   │   │   ├── edicion-plan/         # CargaOferta, EdicionPlan, EdicionPlanAcciones, EdicionPlanSesion y
│   │   │   │                         #   PlanBloques (.html) ↔ EdicionPlanServidor.js
│   │   │   └── docentes-asignados/   # DocentesAsignados.html ↔ DocentesAsignadosServidor.js
│   │   └── logica/                   # Reglas y datos del plan: PlanServicio, PlanRepositorio, Fusiones, DominioPlan…
│   ├── cu002/                        # CU-002 Asignar docentes a plan de ciclo
│   │   ├── vistas/asignacion/        # Asignacion, AsignacionEdicion y AsignacionCarga (.html)
│   │   │                             #   ↔ AsignacionServidor.js, AsignacionEdicionServidor.js
│   │   └── logica/                   # Reglas y datos de la carga: CargaServicio, CargaReglas, CatalogoDocentes…
│   ├── base/                         # Infraestructura de todas las pantallas, sin entradas para el navegador:
│   │                                 #   Nucleo, Ventanas, Pestanas, Arranque, SesionEdicion, Derivacion, Rejilla (navegador);
│   │                                 #   Acceso, Config, BaseDatos, Bloqueos, Versionado, Sesiones, Dominio… (servidor);
│   │                                 #   Estilos, Iconos y Alpine (generados por estilos/)
│   ├── hoja/                         # Menú, panel y diálogos dentro de la hoja del sistema
│   ├── estilos/                      # Fuente de los estilos, logotipos y generadores (no se sube)
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

### Cómo se conecta una pantalla con su servidor

- **Todo lo que una pantalla pide al servidor está en el `…Servidor.js` de su misma carpeta.** Las entradas se llaman «pantalla + acción»: `Tablero.html` llama a `tableroObtener` de `TableroServidor.js`; `Asignacion.html`, a `asignacionBuscarDocentes` de `AsignacionServidor.js`. La prueba `pruebas/infraestructura.test.mjs` lo comprueba en cada `.html`.
- **Una pantalla con varios modos o pasos va entera en su carpeta.** La edición del plan incluye su carga masiva (`CargaOferta.html`); la asignación docente, su modo de edición y su carga masiva. Así, el botón y la función que lo atiende están siempre en la misma carpeta.
- **Cada `<script>` empieza con una ficha:** `Vista`, `Botones`, `Servidor`, `Alpine`, lo que usa de otras pantallas y lo que les ofrece. En el marcado, un comentario junto a cada elemento que se llena desde JavaScript dice qué función lo pinta. `pruebas/infraestructura.test.mjs` comprueba que la línea `Servidor:` de cada ficha nombre todas las entradas que llama su archivo.
- **`base/` no tiene entradas para el navegador.** Sus ayudas reciben el nombre de la entrada de quien las usa. Por ejemplo, la sesión de edición (`base/SesionEdicion.html`) recibe `edicionPlanRenovar` o `asignacionEdicionRenovar`, y por debajo ambas usan `base/Sesiones.js`. En Apps Script todos los `.js` comparten un mismo espacio de nombres y todos los `.html` se incluyen en la misma página, así que la infraestructura no se puede copiar en cada caso de uso sin que sus funciones choquen.
- **Alpine.js.** `<body x-data>` hace de toda la página un componente, y `base/Nucleo.html` define dos stores:
  - **`$store.nav`**: la vista que se ve. Cada `<section id="v-…">` lleva `:hidden="$store.nav.vista !== '…'"` y los botones de la cabecera usan `@click="irA('planes')"`.
  - **`$store.servidor`**: las llamadas en curso. Un botón usa `:class="{ cargando: $store.servidor.ocupado('tableroObtener') }"` y vuelve a su estado al llegar la respuesta.

  Las tablas que llena el servidor se pintan con `x-for`: el tablero de planes (`$store.planes`, CU-001) y la búsqueda de docentes (`$store.busqueda`, CU-002). Las tablas grandes que se siguen pintando con `innerHTML`, como la grilla del plan, llevan `x-ignore`. `base/Arranque.html` llama a `Alpine.start()` cuando ya están cargadas todas las pantallas.
- **[docs/arquitectura/mapa-gui.html](docs/arquitectura/mapa-gui.html)** lista, para cada botón, la función del navegador, la entrada del servidor y el servicio que usa. `pruebas/mapa.test.mjs` comprueba que el mapa coincide con el código.

## Puesta en marcha

Hace falta Node.js y `clasp` (`npm install -g @google/clasp`), con la sesión iniciada con la cuenta institucional dueña del script (`clasp login`). El `.clasp.json` del repositorio apunta al proyecto de Apps Script de la hoja del sistema.

1. **Subir el código.** Desde `AppScript/`, `clasp status` lista lo que se va a subir y `clasp push` lo sube. Si pregunta si sobrescribe el manifest, responde que sí.
2. **Instalar.** Abre el editor con `clasp open-script`, elige la función `instalar` y pulsa **Ejecutar**, aceptando los permisos que pide Google. Crea en tu Drive la carpeta **SISCargaLectiva** con la hoja **SISCargaLectiva-BD** y guarda la configuración en las propiedades del script. El registro de ejecución muestra los enlaces. Se puede repetir sin riesgo.
3. **Subir los Excel.** Arrastra a esa carpeta `SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx` y `SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx` desde `docs/archivos/`. La asignación docente necesita también `SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx`. Deben quedar como `.xlsx`: si Drive convierte las subidas a Hoja de cálculo de Google, desactiva esa opción en su configuración.
4. **Probar.** En el editor, **Implementar → Probar implementaciones** (*Deploy → Test deployments*) da la URL que termina en `/dev`. La primera vez que alguien abre el tablero se leen los Excel.
5. **Publicar.** `clasp deploy -d "descripción"` crea una versión publicada. Para actualizarla sin cambiar la URL: `clasp deploy -i <ID> -d "descripción"`, con el ID que muestra `clasp list-deployments`. En clasp 3, `deploy` es otro nombre de `create-deployment`. El manifest ya fija *Ejecutar como: yo* y *Acceso: cualquier usuario de ulasalle.edu.pe*.

### Crecimiento de las versiones

Cada guardado de un plan o de una carga añade una fila con el contenido completo a `Versiones` o `VersionesCarga`, y ninguna se borra. Mientras no exista el caso de uso *Administrar ciclos*, la política propuesta es: al cerrar un ciclo, archivar en otro libro sus versiones y conservar solo la vigente y la última «registrar» de cada documento. El detalle está en la cabecera de `AppScript/base/Versionado.js`.

### Configuración

Vive en las propiedades del script (**Configuración del proyecto → Propiedades del script**). `instalar()` crea las que falten.

| Propiedad | Valor por defecto | Para qué sirve |
|---|---|---|
| `SIS_CARPETA_ID` | La crea `instalar()` | Carpeta de Drive con los `.xlsx`. |
| `SIS_BD_ID` | La crea `instalar()` | Hoja de cálculo del sistema. |
| `SIS_DOMINIO` | `ulasalle.edu.pe` | Dominio admitido. |
| `SIS_MINUTOS_BLOQUEO` | `30` | Minutos de inactividad antes de liberar el bloqueo de edición. |
| `SIS_MAX_SUBGRUPOS` | `5` | Máximo de subgrupos de un desdoble parcial. |
| `SIS_CICLOS` | `2026-1,2026-2,2027-1,2027-2` | Ciclos del selector. |
| `SIS_CICLO_XLSX` | `2026-1` | Ciclo al que pertenecen los `.xlsx`. |
| `SIS_MINUTOS_REVISION_XLSX` | `5` | Cada cuántos minutos, como máximo, se mira si los `.xlsx` de la carpeta cambiaron. Con `0` se mira en cada carga del tablero, que es más lento. |
| `SIS_ROL_POR_DEFECTO` | `director` | Rol de una cuenta del dominio que no está en la pestaña Usuarios: `director`, `coordinador` (solo consulta) o `ninguno` (acceso denegado). |

Los usuarios se gestionan en la pestaña **Usuarios** de la hoja del sistema, con tres columnas: `correo`, `rol` (`director` o `coordinador`) y `carreras` (siglas separadas por comas, solo para coordinadores). `instalar()` la siembra con las cuentas del equipo como Director. Un cambio en esa pestaña tarda hasta 5 minutos en aplicarse, porque el rol de cada cuenta se guarda en caché.

### Estilos, íconos y logotipos

`base/Estilos.html`, `base/Iconos.html` y `base/Alpine.html` se generan: no se editan a mano. Tailwind toma las clases de los `.html` de `AppScript/`, así que hay que volver a generar los estilos cada vez que cambie el marcado, antes de `clasp push`:

```bash
cd AppScript/estilos
npm install          # instala Tailwind CSS 4.3.3 y Alpine.js 3.17.5 (la primera vez)
npm run construir    # compila entrada.css en ../base/Estilos.html (con los logotipos) y escribe ../base/Alpine.html
npm run iconos       # vuelve a generar ../base/Iconos.html si cambia la lista de íconos (necesita internet)
```

`base/Alpine.html` es Alpine.js sin su arranque automático. El generador falla si una versión nueva de Alpine cambia la forma de ese arranque.

Los logotipos de `estilos/marca/` salen de `universidad-la-salle-logo.jpg` y `logoWayrasimi.png` con `estilos/marca/procesar-logos.ps1`, que usa Windows PowerShell.

### Probar sin Google

```bash
node --test AppScript/pruebas/*.test.mjs      # dominio, docentes, lector de .xlsx y servidor con servicios de Google simulados
node AppScript/pruebas/servidor-local.mjs     # vista previa en http://127.0.0.1:8765/?usuario=<correo>
node AppScript/pruebas/recorrido-ui.mjs       # recorrido de CU-001 en Chrome sin ventana (unos 2 minutos)
node AppScript/pruebas/recorrido-cu002.mjs    # recorrido de la asignación docente en Chrome sin ventana
node AppScript/pruebas/recorrido-fluidez.mjs  # navegación entre secciones y avisos entre pestañas del navegador
```

La prueba del lector comprueba que los Excel reales dan la misma oferta que `docs/prototipo/funcional/datos-ejemplo.js`: 8 carreras, 345 asignaturas y 365 grupos.

En Windows, los recorridos necesitan la ruta de Chrome en la variable `CHROME`, por ejemplo `CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe"`.

### Comprobar los tipos

Los `.js` de `AppScript/` llevan `// @ts-check` y JSDoc; los tipos comunes están en `Tipos.js`, que solo tiene comentarios. Antes de `clasp push` conviene pasar `tsc` (la primera vez, `npm install`):

```bash
cd AppScript && npm install && npm run tipos
```

`package.json`, `package-lock.json` y `jsconfig.json` están en `.claspignore`: no llegan a Apps Script.

## Prototipos anteriores

Se conservan como referencia:

- `docs/prototipo/funcional/`: prototipo operativo en una sola página, con acceso por Google Identity Services y los datos en memoria. Se ejecuta con `python3 servir.py` y se despliega en Dokploy con `compose.yml`; su guía está en [docs/prototipo/funcional/README.md](docs/prototipo/funcional/README.md).
- `docs/prototipo/CU-001-Registrar-Plan-de-Ciclo.html`: cascarón de solo pantallas para recorrer el flujo básico y los flujos alternativos; se abre directamente en el navegador.

## Documentación

- [docs/plan/plan-carga-por-carrera.md](docs/plan/plan-carga-por-carrera.md): plan por fases, límites de Apps Script que condicionan el diseño y avance. Sus fases 1 a 3 ya no están en `AppScript/` (ver *Estado del proyecto*).
- [requirements.md](docs/requerimientos/requirements.md): requisitos funcionales y no funcionales, reglas de interpretación y de carga docente, plantilla de importación, hallazgos en los Excel, decisiones del equipo y preguntas abiertas.
- [docs/CU/CU-001-Registrar-Plan-de-Ciclo.md](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md): caso de uso del plan de ciclo (v6.0), con la edición en la web y en la hoja de la carrera.
- [docs/QA/Checklist.md](docs/QA/Checklist.md): criterios que debe cumplir cada caso de uso.
