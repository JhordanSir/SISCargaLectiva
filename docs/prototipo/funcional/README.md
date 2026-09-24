# Prototipo funcional — CU-001 Registrar Plan de Ciclo

Prototipo operativo del caso de uso CU-001 con autenticación real mediante **Google
Identity Services**. A diferencia del cascarón de `docs/prototipo/`, aquí las acciones
hacen algo: el contenido pegado o importado se analiza de verdad y el plan se
construye a partir de los datos reales. El sistema no valida ese contenido: lo
interpreta, y nada se rechaza.

Son tres archivos —`index.html`, `servir.py` y `datos-ejemplo.js`— sin dependencias
que instalar. En local se ejecuta con Python; para el servidor hay un
`compose.yml` en la raíz del repositorio.

---

## 1. Configurar el acceso con Google

Google Identity Services exige un **ID de cliente** y un **origen autorizado**. Sin
esto la aplicación arranca en una pantalla de configuración y no permite iniciar sesión.

1. Entra en <https://console.cloud.google.com> y crea o elige un proyecto.
2. **API y servicios → Pantalla de consentimiento de OAuth.** Si el proyecto pertenece
   a la organización de `ulasalle.edu.pe`, elige **Interna**; así solo entran cuentas
   del dominio. Si no, elige **Externa** y añade las cuentas de prueba.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth**, tipo
   **Aplicación web**.
4. En **Orígenes de JavaScript autorizados** añade exactamente la dirección desde la
   que vas a servir el prototipo, por ejemplo `http://localhost:8000`. Debe coincidir
   carácter a carácter, incluido el puerto.
   No hace falta URI de redirección: este prototipo usa el modo de token de ID.
5. Copia el **ID de cliente** (termina en `.apps.googleusercontent.com`).
6. En la raíz del repositorio, crea tu `.env` a partir del ejemplo y pega ahí el valor:

   ```bash
   cp .env.example .env      # si aún no existe
   ```

   ```ini
   GOOGLE_CLIENT_ID=123456789-xxxxxxxx.apps.googleusercontent.com
   ```

> `.env` está excluido del control de versiones; `.env.example` sí se versiona y no
> debe llevar valores reales.
>
> El ID de cliente es público y acaba llegando al navegador de todos modos. El
> **secreto** de cliente no se usa aquí y nunca debe incluirse en una página web.

---

## 2. Ejecutar

```bash
cd docs/prototipo/funcional
python3 servir.py            # http://localhost:8000
python3 servir.py 8080       # otro puerto
```

`servir.py` solo usa la biblioteca estándar. Busca el `.env` en este directorio y en
sus padres hasta la raíz del repositorio, y expone al navegador —mediante un
`/config.js` generado al vuelo, que no se escribe en disco— únicamente las variables
`GOOGLE_CLIENT_ID` y `SIS_DOMINIO`. El resto del `.env` no sale nunca del servidor.
Al arrancar imprime el origen exacto que debes registrar en Google Cloud.

Las variables del entorno del sistema tienen prioridad sobre el archivo, lo que
permite probar sin tocarlo:

```bash
GOOGLE_CLIENT_ID=otro-id.apps.googleusercontent.com python3 servir.py
```

### Desplegar en el servidor

El despliegue va en **Dokploy**, con el `compose.yml` de la raíz del repositorio.
Ese archivo **no publica puertos ni lleva etiquetas de Traefik**: el enrutado y el
certificado los genera Dokploy. Tampoco sirve para abrirlo en tu equipo; para eso
usa `python3 servir.py`.

En la pestaña **Domains** de la aplicación:

| Campo | Valor |
|---|---|
| Service Name | `prototipo` |
| Host | `nohagotuchamba.wayrasimi.tech` |
| Path | `/` |
| **Container Port** | **`8000`** |
| HTTPS | activado, con Let's Encrypt |

El **Container Port es el error más fácil de cometer**: el valor por defecto de la
interfaz es `80`, pero `servir.py` escucha en el `8000`. Con el puerto mal puesto
Traefik entrega un 404 o un 502 aunque el certificado se haya emitido bien.

En la pestaña **Environment**: `GOOGLE_CLIENT_ID` y, si difiere del valor por
defecto, `SIS_DOMINIO`. Si falta el ID de cliente el contenedor arranca igual y la
aplicación muestra su pantalla de configuración.

> **El dominio público debe registrarse en Google Cloud.** El origen
> `https://nohagotuchamba.wayrasimi.tech` es distinto de `http://localhost:8000`
> para Google, así que hay que añadirlo en *Orígenes de JavaScript autorizados* o
> el acceso fallará con `Error 401: invalid_client`.

**No funciona abriendo el archivo con doble clic.** Un origen `file://` no puede
autenticar contra Google; la aplicación lo detecta y lo avisa en pantalla. Servirlo
con `python3 -m http.server` tampoco basta: sin `servir.py` no se lee el `.env` y la
aplicación abre la pantalla de configuración.

---

## 3. Configuración

En `.env` (documentado en `.env.example`):

| Variable | Para qué sirve |
|---|---|
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth. Obligatorio. |
| `SIS_DOMINIO` | Dominio institucional admitido. Por defecto `ulasalle.edu.pe`. |
| `SIS_PUERTO` | Puerto de `servir.py`. Por defecto 8000. Un puerto pasado por argumento manda sobre este valor. |

En el objeto `CONFIG` de `index.html` quedan los ajustes de comportamiento, que no son
propios del entorno:

| Clave | Para qué sirve |
|---|---|
| `MINUTOS_BLOQUEO` | Inactividad antes de liberar el bloqueo de edición. Por defecto 30. Bájalo para probar la expiración sin esperar. |
| `MAX_SUBGRUPOS` | Máximo de subgrupos de un desdoble parcial. |
| `DIRECTORIO` | Roles por correo. En el sistema definitivo esto vive en la base de datos. |
| `ROL_POR_DEFECTO` | Rol para una cuenta del dominio que no figure en `DIRECTORIO`. De fábrica es `{ rol: "director" }`, para que cualquier cuenta institucional pueda recorrer todo el caso de uso. Ponlo en `null` para denegar el acceso a quien no esté listado. |

El **director** edita el plan de cualquier carrera; el **coordinador** solo el de las
carreras que tenga asignadas y consulta el resto en solo lectura (RN-02). En el tablero,
el botón **Editar** aparece únicamente en las carreras que la cuenta tenga autorizadas.

Para probar la vista restringida de un coordinador, añade la cuenta al directorio:

```js
DIRECTORIO: {
  "mfloresl@ulasalle.edu.pe":  { rol: "coordinador", carreras: ["ING"] },
  "r.delgado@ulasalle.edu.pe": { rol: "director" }
}
```

El directorio manda sobre `ROL_POR_DEFECTO`.

---

## 4. Oferta de ejemplo

`datos-ejemplo.js` lleva la oferta real extraída de
`docs/archivos/SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx`: **365 grupos en 8 carreras**.
Las marcas `INTERNACIONAL` y `FUSIÓN` provienen de la columna CONDICIÓN de
`SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx`. Si borras el archivo, la aplicación
arranca con el tablero vacío y sigue funcionando.

`SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx` **no se usa**: es el padrón de docentes
con su dedicación y departamento, que corresponde al caso de uso de asignación docente,
fuera del alcance de CU-001.

Reparto de estados, pensado para que el tablero muestre los tres del CU:

| Ciclo | Carrera | Estado | Versiones |
|---|---|---|---|
| 2026-1 | Ingeniería de Software | Registrado | 3 |
| 2026-1 | Administración de Empresas | Registrado | 3 |
| 2026-1 | Derecho | Registrado | 2 |
| 2026-1 | Ingeniería Industrial | Borrador | 2 |
| 2026-1 | Psicología | Borrador | 1 |
| 2026-1 | Arquitectura | Borrador, **bloqueado** por otro usuario | 1 |
| 2026-1 | Comunicación · Ing. Comercial | Sin Iniciar | — |
| 2027-1 | Comunicación · Ing. Comercial | Borrador | 1 y 2 |

Las versiones anteriores se reconstruyen como estados parciales del plan, de modo que
compararlas y restaurarlas tenga sentido en la demostración.

> Los estados del plan en CU-001 v2.0 son **Sin Iniciar → Borrador → Registrado**.
> *En Planificación* era un estado del **ciclo**, no del plan, y la versión 2.0 lo
> eliminó: el ciclo es siempre editable (RN-03).

### Normalizaciones aplicadas al importar los Excel

Los archivos de `docs/archivos/` no siguen la plantilla oficial. Al extraerlos para
`datos-ejemplo.js` se normalizó lo siguiente. El importador de la aplicación ya no
rechaza nada de esto: lo interpreta o lo conserva como texto.

| Problema en el origen | Corrección | Veces |
|---|---|---|
| Cabecera en la fila 3, con un título encima | Se detecta la fila de cabeceras | 8 hojas |
| `DPTO` con `DAHUC` | *(ya no se corrige: `DAHUC` es el código oficial)* | — |
| `SEMESTRE` como fecha serial: `1-1` se guardó como 1-ene | Día = semestre, mes = grupo | 38 |
| `SEMESTRE` como texto `"3 - 1"` | Semestre 3, grupo 1 | 2 |
| Columna H rotulada `HT` que en realidad es el total | Se usa como TOTAL HORAS | todas |
| Columnas `DOCENTE` y `TURNO` | Se descartan (RN-09) | todas |
| Una fila con código y grupo repetidos | Se conserva la primera | 1 |

---

## 5. Qué está realmente implementado

**Pegado con forma de hoja de cálculo.** La opción *Pegar desde Google Sheets* no muestra
un cuadro de texto, sino una rejilla: al pegar (Ctrl+V en cualquier punto de la vista, o
soltando un archivo encima) el contenido se reparte en celdas con cabeceras de columna
`A`, `B`, `C`… y numeración de filas, y al pie se indica cuántas filas y columnas se
leyeron. Así se comprueba lo que el sistema ha interpretado antes de procesarlo.

**Importación sin restricciones.** No hay validación: **nada se rechaza nunca**. No existen
las reglas de error `E01`–`E12` ni las advertencias `A01`–`A06`; el motor no valida, sólo
interpreta. Cualquier contenido entra, y lo que no se entienda se conserva como texto.

- **Cualquier archivo.** No se filtra por extensión. Si parece un libro de cálculo se lee
  con SheetJS; si no, o si falla, se lee como texto plano.
- **Cualquier separador.** Tabulaciones, comas o punto y coma, con o sin comillas.
- **Con o sin cabeceras.** Si las hay, mandan. Lo que quede sin identificar se deduce del
  contenido: un código por su forma `3.1.1.24`, la malla por el año, la carrera por su
  sigla o alias, el departamento por su código, la asignatura por ser el texto más largo.
  Lo que no se reconoce se ignora sin avisar.
- **El texto del usuario se conserva intacto.** Si `HT` dice «muchas», la celda guarda y
  muestra «muchas». Los cálculos extraen el número que puedan de cada celda y, si no hay
  ninguno, usan cero; así los totales nunca fallan pero tampoco alteran lo escrito.
- **El semestre admite cualquier cosa.** `5` es el semestre 5 grupo 1, `1-2` es el semestre 1
  grupo 2, y cualquier otro texto da nombre a su propio bloque.
- **Registrar siempre funciona**, esté el plan como esté.

> Esto revierte el requisito de CU-001 §3.2, donde un solo error rechazaba todo el archivo.
> Fue una decisión expresa; conviene registrarla con su `P##` en `preguntas.md` y reflejarla
> en `requirements.md` y en el CU, que siguen describiendo el comportamiento estricto.

**Edición.** Agregar y eliminar asignaturas, agregar y eliminar grupos, agregar un
grupo a todo un semestre, editar HT y HP con recálculo del total, desdoble parcial de
práctica o de teoría, fusión de grupos con elección del grupo principal y deshacer
fusión. Las eliminaciones y las fusiones advierten pero nunca se bloquean.

**Estados y versionado.** Sin Iniciar → Borrador → Registrado. Un plan registrado
sigue siendo editable y nunca vuelve a borrador. Cada guardado genera una versión:
borrador, registro, guardar cambios, autoguardado y restauración. El historial permite
consultar y restaurar, y la restauración genera una versión nueva.

**Concurrencia.** Bloqueo de edición por carrera con temporizador visible. Al expirar
se autoguarda el trabajo y se libera el bloqueo. Los demás usuarios ven el plan en
solo lectura.

**Tablero.** Estado, semestres, asignaturas, grupos, horas, versión vigente y quién
está editando cada carrera del ciclo.

---

## 6. Límites conocidos

- **La firma del token de ID no se verifica.** La página comprueba el emisor, el
  destinatario, la caducidad y el dominio, que es lo que puede comprobarse en el
  navegador. La verificación criptográfica corresponde al backend y es obligatoria
  antes de producción.
- **Los datos viven en memoria durante la sesión.** Al recargar la página se pierden
  los planes. Fue una decisión explícita para este prototipo.
- **Los roles salen de `CONFIG.DIRECTORIO`**, no de una base de datos.
- **La oferta de ejemplo es de `2026-I`.** Está sembrada tal cual; si quieres
  demostrar la importación desde cero, usa una carrera en *Sin Iniciar*.
- **No hay validación de ninguna clase.** El dato entra como venga, así que el plan puede
  contener celdas sin sentido. Cuando exista el backend habrá que decidir qué se valida
  ahí antes de habilitar la asignación docente.
- Requiere conexión a internet: Google Identity Services y la biblioteca de lectura de
  `.xlsx` se cargan desde sus CDN.

---

## 7. Comprobaciones

El motor de importación se validó con 25 comprobaciones sobre las reglas `E02`–`E12`,
`A01`–`A04` y `RN-09`/`RN-10`, además de la detección de cabeceras con preámbulo, los
sinónimos y el análisis de CSV con comillas. La interfaz se verificó en navegador
recorriendo el flujo completo hasta la vista previa del plan.
