# SISCargaLectiva

Sistema web para planificar la **carga lectiva** de la Universidad La Salle (Arequipa): qué cursos y grupos abre cada carrera en un ciclo y qué docentes los dictan.

Hoy este proceso se lleva en varios Google Sheets separados, uno por carrera y otro por departamento, que hay que mantener sincronizados a mano. SISCargaLectiva los reemplaza por **un solo registro**. Los listados por carrera, por departamento y por docente pasan a ser reportes generados desde ese registro.

## Estado del proyecto

🚧 **Fase 1.** CU-001 funciona como aplicación web de **Google Apps Script**, en la carpeta `AppScript/`.

| Fase | Caso de uso | Estado |
|---|---|---|
| 1 | **CU-001 Registrar plan de ciclo** | Implementado en Apps Script |
| 2 | Administrar ciclos | Pendiente |
| 3 | Asignar docentes a plan de ciclo | Pendiente |
| 4 | Generar reporte de carga lectiva (por carrera, departamento y docente) | Pendiente |
| 5 | Asignar docentes a cursos por jurado | Pendiente |

## ¿Qué hace la fase 1?

El **Coordinador de carrera** (en sus carreras) o el **Director de departamento** (en cualquier carrera) registra el plan de ciclo de una carrera:

- **Los Excel son la fuente de datos.** La oferta de 2026-1 se lee de los `.xlsx` de una carpeta de Google Drive, sin convertirlos, y cada carrera arranca como *Registrado v1*. Si el Excel cambia, cada plan afectado recibe una versión nueva. Los `.xlsx` nunca se modifican. La carpeta se revisa como mucho cada 5 minutos; el botón **Releer Excel** del tablero la revisa en el momento.
- **Carga masiva:** se pega desde Google Sheets o se sube un `.xlsx` o `.csv`. El sistema no valida: interpreta lo que recibe y nunca rechaza una carga (CU-001 v4.0). Solo toma las filas de la carrera del plan.
- **Grilla por semestre** para editar horas, asignaturas y grupos: agregar grupos, desdoblar la práctica o la teoría y fusionar grupos del plan, siempre con aviso y sin bloquear.
- **Estados** Sin Iniciar → Borrador → Registrado. Un plan Registrado sigue siendo editable y **cada guardado genera una versión**, que se puede restaurar.
- **Tablero** con el avance de todas las carreras del ciclo.
- **Bloqueo de edición** por carrera, con expiración y autoguardado.

El detalle está en [requirements.md](docs/requerimientos/requirements.md) y en [CU-001](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md).

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Google Apps Script: servidor en `.js` y página con HtmlService |
| Datos | Los `.xlsx` de una carpeta de Google Drive (fuente, solo lectura) y una hoja de cálculo de Google, «SISCargaLectiva-BD», con los planes, las versiones, los bloqueos y los usuarios |
| Acceso | Cuenta de Google del dominio `@ulasalle.edu.pe` |
| Despliegue | `clasp`, la herramienta de línea de comandos de Apps Script |

## Estructura del repositorio

```
.
├── AppScript/                       # Aplicación de Apps Script (se sube con clasp)
│   ├── Principal.js                 # doGet: arma la página
│   ├── Planes.js, Bloqueos.js       # Tablero, guardado, versiones y bloqueo de edición
│   ├── FuenteDrive.js, LectorXlsx.js  # Lectura de los .xlsx de Drive
│   ├── Dominio.js                   # Interpretación y edición, compartidas con el navegador
│   ├── Acceso.js, Config.js, BaseDatos.js
│   ├── Index.html, App.html, Estilos.html
│   └── pruebas/                     # Pruebas y vista previa local (no se sube)
├── docs/
│   ├── CU/                          # Casos de uso y diagrama de CU
│   ├── QA/Checklist.md              # Checklist de calidad para casos de uso
│   ├── archivos/                    # Excel reales: la fuente de datos
│   ├── feedback/                    # Transcripciones de la clase y de las revisiones del docente
│   ├── requerimientos/              # requirements.md
│   └── prototipo/                   # Prototipos anteriores, como referencia
├── compose.yml                      # Despliegue del prototipo en Python (Dokploy)
└── .env.example                     # Variables del prototipo en Python
```

## Puesta en marcha

Hace falta Node.js y `clasp` (`npm install -g @google/clasp`), con la sesión iniciada con la cuenta institucional dueña del script (`clasp login`).

1. **Subir el código.** Desde `AppScript/`, `clasp status` lista lo que se va a subir y `clasp push` lo sube. Si pregunta si sobrescribe el manifest, responde que sí.
2. **Instalar.** Abre el editor con `clasp open-script`, elige la función `instalar` y pulsa **Ejecutar**, aceptando los permisos que pide Google. Crea en tu Drive la carpeta **SISCargaLectiva** con la hoja **SISCargaLectiva-BD** y guarda la configuración en las propiedades del script. El registro de ejecución muestra los enlaces. Se puede repetir sin riesgo.
3. **Subir los Excel.** Arrastra a esa carpeta `SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx` y `SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx` desde `docs/archivos/`. Deben quedar como `.xlsx`: si Drive convierte las subidas a Hoja de cálculo de Google, desactiva esa opción en su configuración.
4. **Probar.** En el editor, **Implementar → Probar implementaciones** (*Deploy → Test deployments*) da la URL que termina en `/dev`. La primera vez que alguien abre el tablero se leen los Excel.
5. **Publicar.** `clasp deploy -d "descripción"` crea una versión publicada. Para actualizarla sin cambiar la URL: `clasp deploy -i <ID> -d "descripción"`, con el ID que muestra `clasp list-deployments`. El manifest ya fija *Ejecutar como: yo* y *Acceso: cualquier usuario de ulasalle.edu.pe*.

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

### Probar sin Google

```bash
node --test AppScript/pruebas/*.test.mjs      # dominio, lector de .xlsx y servidor con servicios de Google simulados
node AppScript/pruebas/servidor-local.mjs     # vista previa en http://127.0.0.1:8765/?usuario=<correo>
node AppScript/pruebas/recorrido-ui.mjs       # recorrido de la interfaz en Chrome sin ventana (unos 2 minutos)
```

La prueba del lector comprueba que los Excel reales dan la misma oferta que `docs/prototipo/funcional/datos-ejemplo.js`: 8 carreras, 345 asignaturas y 365 grupos.

## Prototipos anteriores

Se conservan como referencia:

- `docs/prototipo/funcional/`: prototipo operativo en una sola página, con acceso por Google Identity Services y los datos en memoria. Se ejecuta con `python3 servir.py` y se despliega en Dokploy con `compose.yml`; su guía está en [docs/prototipo/funcional/README.md](docs/prototipo/funcional/README.md).
- `docs/prototipo/CU-001-Registrar-Plan-de-Ciclo.html`: cascarón de solo pantallas para recorrer el flujo básico y los flujos alternativos; se abre directamente en el navegador.

## Documentación

- [requirements.md](docs/requerimientos/requirements.md): requisitos funcionales y no funcionales, reglas de interpretación, plantilla de importación, hallazgos en los Excel, decisiones del equipo y preguntas abiertas.
- [docs/CU/CU-001-Registrar-Plan-de-Ciclo.md](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md): caso de uso de la fase 1.
- [docs/QA/Checklist.md](docs/QA/Checklist.md): criterios que debe cumplir cada caso de uso.
