### **Transcripción del audio**

**[00:00 - 01:12] Presentación: Flujo básico (Ingreso, selección de ciclo y carrera)**
* **Estudiante (Expositor):** ...el responsable de plan de ciclo... El sistema redirige al proveedor de OAuth, ¿no? Aquí lo que se valida es que sea el correo institucional correcto, dependiendo del... Una vez que ya se verifica esta parte, ya pasamos a lo a lo demás, que sería que el responsable del plan de ciclo selecciona la opción «Gestión de planes de ciclo» en el menú de navegación. El sistema carga los selectores de ciclos académicos disponibles para el tablero de monitoreo general.  
De ahí se muestra la pantalla de registro de planes de ciclo. El responsable de plan de ciclo selecciona un ciclo académico en la lista desplegable que le permite agregar el que quiera. El sistema consulta las carreras profesionales que el usuario tiene autorizadas a su cargo. El sistema carga en la lista desplegable las carreras autorizadas. El responsable de plan de ciclo selecciona una carrera profesional en la lista desplegable. El sistema habilita la sección de carga masiva de la oferta académica en la interfaz. Luego de eso le permite pegarlo o subir el archivo Excel y descargar también la plantilla oficial.

**[01:13 - 02:00] Flujo básico: Pegar desde Google Sheets y validaciones**
* **Estudiante (Expositor):** Después de esto, el responsable de plan de ciclo selecciona la pestaña «Pegar desde Google Sheets», que es lo que hemos comentado en la clase anterior. El sistema muestra el área de pegado matricial con instrucciones de uso. El responsable de plan de ciclo copia el rango de celdas desde su documento de Google Sheets y luego pega los datos dentro de la matriz, ¿no?  
El sistema recibe el paquete de datos tabulados pegados por el actor, el sistema analiza la estructura de delimitadores de texto, tabulaciones de contenido, el sistema reconstruye... Estas son solamente las validaciones de que se cumpla el formato de las cabeceras y el formato de que contenga algo, pues.  
Bajamos, bajamos... Estas son validaciones, validaciones, validaciones... Bien, listo.

**[02:01 - 02:52] Flujo básico: Vista previa, confirmación y registro**
* **Estudiante (Expositor):** Aquí, una vez que ya se realizaron todas las validaciones, el sistema habilita los controles de gestión de grupo y formalización de la vista previa. El responsable de plan de ciclo revisa los grupos directamente dentro de la vista previa y selecciona el botón «Finalizar y registrar el plan».  
El sistema despliega una ventana modal de confirmación con el resumen consolidado de todo lo que ha añadido el responsable de plan de ciclo y le presenta el mensaje informativo, ¿no? Una vez ya terminado todo eso, el responsable de plan de ciclo presiona «Confirmar y registrar» en la ventana.  
Finalmente, el sistema lo registra, cambia el estado a «Registrado» y se muestra la confirmación de registro exitoso. Ese es el flujo básico.

**[02:53 - 03:52] Flujo alternativo: Subir archivo Excel (.xlsx)**
* **Estudiante (Expositor):** Bien. Ahora, el flujo básico lo abordamos desde la parte de pegar la información directamente desde Google Sheets. El primer flujo alternativo que tenemos es para subir un Excel.  
Aquí lo que hace la persona es seleccionar la opción «Subir el archivo Excel». El sistema habilita la importación de archivos locales en la interfaz, muestra un área de importación de los archivos locales (esto es como cuando en Drive le pones a subir). Carga el archivo local preparado en la plantilla normada, o sea, que cumpla con todos los datos que hemos dicho anteriormente, y el sistema recibe el archivo subido por el actor.  
Luego se valida que el archivo cargado tenga el formato `.xlsx`, reconstruye en la memoria la matriz de datos del archivo y el flujo se reanuda en el paso 22 del flujo básico, que es cuando terminan de subir y empiezan las validaciones.

**[03:53 - 05:25] Flujos alternativos: Edición directa en vista previa y cancelación modal**
* **Estudiante (Expositor):** A partir de ahí, otro de los flujos importantes que tenemos es el flujo 9, que es la parte de la edición y ajuste manual directo sobre la vista previa.  
Durante el paso 36 del flujo básico, el responsable de plan de ciclo selecciona una celda editable de la vista previa. El sistema habilita la edición directa del campo seleccionado. El responsable de plan de ciclo modifica el valor del campo, el sistema valida el valor modificado. Esto lo que te permite es que si identificaste durante el resumen que colocaste algún valor mal, puedas editarlo y corregirlo antes de la subida sin tener que borrar todo lo demás que hiciste.  
Una vez que el sistema aplica el valor validado en la vista previa, el flujo regresa al paso 36 del flujo básico.  
Después de ahí tenemos el flujo alternativo 10, que es «Cancelación de la formalización en la ventana modal». Esto lo que le va a permitir es que, una vez que se muestra la vista previa, el responsable de plan de ciclo puede cancelar la subida para que no entre en estado «Registrado» y pueda seguir editándolo si vio que hay muchos errores o quiere cancelarlo por algún motivo x. Y el flujo regresa al paso 36.

**[05:26 - 06:37] Flujo alternativo: Acceso denegado por falta de permisos**
* **Estudiante (Expositor):** Tenemos también el «Acceso denegado por rol sin permiso sobre la oferta académica». Esto es en el caso de que la cuenta institucional que esté ingresando no tenga los permisos necesarios para gestionar los planes de ciclo.  
Aquí simplemente el usuario le da al botón «Iniciar sesión con Google», se autentica con OAuth con su cuenta de correo institucional. El sistema recibe la confirmación de autenticación y extrae la dirección de correo institucional. El sistema consulta en la base de datos los roles y permisos de las carreras asociadas a la cuenta. El sistema verifica que la cuenta de correo no posee asignado el perfil de responsable de plan de ciclo (que puede ser un coordinador de carrera o un director) y despliega una pantalla de error de acceso denegado con el mensaje informativo: *«Acceso denegado, la cuenta de correo institucional no cuenta con los permisos autorizados de responsable de plan de ciclo. Contacte con la administración del sistema»*.  
El sistema destruye la sesión temporal creada y redirige al usuario a la pantalla inicial de inicio de sesión de Google.

**[06:38 - 07:25] Flujo alternativo: Reanudación de plan en borrador**
* **Estudiante (Expositor):** Ahora vamos al flujo alternativo 13, que es la reanudación de edición de un plan en estado «Borrador». Aquí lo que realizamos fue que el usuario responsable pueda dejar de subir sus cosas y dejarlo ahí para que se guarde temporalmente.  
En este flujo retoma otra vez la edición de ese mismo borrador: selecciona una carrera profesional cuyo plan se encuentra en borrador, el sistema recupera la estructura del plan almacenada previamente, muestra el plan recuperado en la vista previa y notifica el estado del plan recuperado. El flujo se reanuda en el paso 36 del flujo básico.

**[07:26 - 09:17] Flujos alternativos: Inconsistencias, formato no válido y aforo mínimo**
* **Estudiante (Expositor):** El flujo alternativo 18 es la «Detección de inconsistencias en la validación de la oferta académica». Si el responsable carga una oferta con registros que incumplen las reglas de validación, el sistema valida cada fila mediante las reglas de carga, consolida las inconsistencias identificadas, aplica un marcador gráfico distintivo a las filas afectadas en la grilla de la vista previa y configura las acciones disponibles según las inconsistencias, reanudando en el paso 36.  
El flujo 19 es «Archivo con formato no admitido en importación local». Si en lugar de un `.xlsx` sube otro tipo de archivo incompatible, el flujo retorna al inicio porque no se completó la subida.  
También tenemos la «Señalización de grupos por debajo del aforo mínimo». Si al registrar un curso se detecta que no alcanza el aforo mínimo, se manda una señalización aplicando un marcador gráfico distintivo al grupo y actualizando el indicador en el panel de resumen global como advertencia.

**[09:18 - 10:01] Flujo alternativo: Desdoblamiento parcial**
* **Estudiante (Expositor):** El flujo alternativo 24 es «Desdoblamiento parcial no aplicable por ausencia de horas prácticas». El desdoblamiento es cuando se selecciona un grupo y se divide en varios. En este caso, si el curso no cuenta con horas prácticas (solo tiene teoría) y se intenta hacer un desdoblamiento parcial, el sistema indica que no genera subgrupos de práctica porque no existen, y retorna al flujo.

**[10:02 - 11:31] Flujo alternativo: Fusión rechazada por incompatibilidad**
* **Estudiante (Expositor):** El flujo alternativo 26 es «Fusión rechazada por incompatibilidad de las asignaturas seleccionadas». Así como se permite desdoblar, se debería poder fusionar grupos. Si los grupos no comparten el mismo nombre o las mismas horas dictadas, no se puede realizar la fusión porque no corresponden a la misma asignatura.  
El sistema verifica la compatibilidad, muestra el mensaje de incompatibilidad, conserva abierto el panel de fusión y regresa al paso 4 del flujo alternativo 6.  
Dentro de esos estarían los más importantes. Los demás son, por ejemplo, disolución de un grupo fusionado (darle al botón cancelar tras fusionar) y cosas similares.

---

### **[11:32 - 19:40] Retroalimentación y Preguntas: Edición de planes registrados y flexibilidad**

* **Docente / Evaluador:** Primero, lo del borrador. El borrador, ¿es algo excepcional o está dentro de lo normal?
* **Estudiante (Expositor):** No, es normal. Porque cuando empiezas a realizar el plan de ciclo, podrías iniciarlo en estado de borrador si no estás seguro de que esa sea la estructura definitiva.
* **Docente / Evaluador:** Y después, a futuro, ¿cuál sería la restricción cuando ya no sea borrador, cuando ya esté registrado? ¿No se va a poder editar?
* **Estudiante (Expositor):** Claro, una vez registrado ya se supone que debieron haberse hecho todas las validaciones.
* **Docente / Evaluador:** Pero cuando ya esté registrado, ¿igual se puede editar?
* **Estudiante (Expositor):** No, ya no se puede editar.
* **Docente / Evaluador:** Es que sí sería necesario que se pueda hacer eso, porque... miren, estábamos pensando en hacer una restricción por fecha en caso de que inicie el semestre. Pero la realidad es otra: ustedes tienen matrícula extemporánea, ¿verdad?
* **Estudiantes:** Sí.
* **Docente / Evaluador:** Cuando ya empiezan las clases, hay ampliaciones de matrícula. Hay estudiantes que entran a un curso una o dos semanas después. ¿Qué pasaría si eso ocurre con varios estudiantes? Tienes que abrir un nuevo grupo. Entonces tu plan tiene que cambiar. No podemos decir «el plan ya está cerrado y no se toca». El sistema tiene que ser flexible. Si el sistema no lo deja, la gente va a abrir el grupo en un Excel por fuera y van a dejar de usar su sistema.  
Más que prohibir, el sistema debe avisar: *«Este curso que quieres eliminar ya tiene un docente asignado, ¿deseas eliminarlo de todas formas?»*. Se le notifica, pero se le permite, bajo responsabilidad del usuario.

---

### **[19:41 - 24:45] Preguntas: Información de departamentos y estructura de datos**

* **Docente / Evaluador:** Los datos que colocan por cada línea del plan de ciclo, ¿qué datos eran? Curso, código...
* **Estudiante:** Sí, código, nombre del curso...
* **Docente / Evaluador:** Deberíamos incluir también a qué departamento académico se le va a pedir ese curso. La carrera solicita la apertura del curso, pero ¿qué departamento pone al profesor? Habría que agregar ese campo para seleccionar el departamento.  
Ahora, el plan de estudios no suele traer el departamento de forma explícita para todos los cursos, porque hay asignaturas que son de otros departamentos (como humanidades, derecho, etc.). Se podría poner una opción por defecto y cambiarlo en las excepciones.  
Otra duda: al comienzo ustedes estaban planteando todo por carrera. ¿La persona ingresa y gestiona por una sola carrera o por varias?
* **Estudiante 2:** Los coordinadores individuales ven solo su carrera, pero un responsable general o director podría ver todas las carreras autorizadas.
* **Docente / Evaluador:** ¿Y tienen un flujo alternativo para el caso en que una carrera no tenga nada registrado?
* **Estudiante (Expositor):** Sí, tenemos el caso de cuando se sube una matriz sin filas con datos (donde solo se pega la fila de encabezados sin contenido). El sistema informa que no contiene asignaturas y regresa al paso 14.

---

### **[24:46 - 31:00] Debate: Interfaz propia vs. Google Sheets**

* **Docente / Evaluador:** Si se pega un listado general de todas las carreras, ¿cómo se organiza? ¿El usuario ve todo junto o por pestañas?
* **Estudiante:** Se ordena dentro de la matriz.
* **Docente / Evaluador:** Para la próxima semana les voy a pedir que hagan un prototipo de pantallas, aunque no sea funcional (en HTML o en AppSheet), para entender mejor cómo fluyen las pantallas.  
Tomen en cuenta que el usuario está muy habituado a Google Sheets: tiene sus pestañas por carrera, sus colores por ciclo. Si en el sistema le mostramos un listado plano gigante, va a ser difícil de leer. El usuario necesita ver claramente: por carrera, qué semestres y cuántos cursos hay por cada semestre.

---

### **[31:01 - 37:25] Fusión de asignaturas y reglas académicas**

* **Docente / Evaluador:** ¿Cómo se fusionan dos cursos de diferentes carreras? Por ejemplo, asignaturas generales que llevan juntos estudiantes de distintas facultades.
* **Estudiante (Expositor):** El responsable selecciona dos o más asignaturas coincidentes de distintas mallas o carreras. En la validación que pusimos, verificamos que compartan la misma denominación y la misma cantidad de horas teóricas y prácticas.
* **Docente / Evaluador:** ¿Los nombres tienen que ser exactamente idénticos?
* **Estudiante (Expositor):** En nuestro diseño actual sí, si varía el nombre no se considera la misma asignatura.
* **Docente / Evaluador:** Hay casos reales donde los planes cambian ligeramente de nombre entre mallas (por ejemplo, *Evaluación de proyectos* vs. *Evaluación y mejora de proyectos*) o cambian de código, pero en el fondo son el mismo curso a fusionar. La Ley Universitaria no define la fusión de asignaturas como tal (la ley habla de convalidaciones externas), la fusión es un proceso interno. Lo que realmente manda en la fusión son los créditos y las horas. Deberían permitir que el usuario seleccione cuáles fusionar y advertirle sobre las diferencias en vez de bloquearlo rígidamente.

---

### **[37:26 - 41:00] Desdoblamiento y eliminación de grupos**

* **Docente / Evaluador:** Respecto al desglose o desdoblamiento: ¿se desdobla todo el curso o solo laboratorio?
* **Estudiante (Expositor):** Contemplamos dos: el desdoblamiento total (aumenta grupos completos paralelos) y el parcial (separa los grupos para la parte práctica o laboratorio manteniendo la teoría).
* **Docente / Evaluador:** Muy bien por esa distinción. Asegúrense de que sea flexible para horas de práctica o teoría.  
Y sobre la eliminación de grupos: vi que pusieron una opción de «eliminar por aforo mínimo». No limiten la eliminación solo a la razón del aforo mínimo. El usuario puede querer eliminar un grupo porque se equivocó al crearlo, porque se fusionó o por cualquier otra razón. Debe ser una acción genérica de «Eliminar grupo», con su respectiva confirmación y advertencias si ya tenía docentes o alumnos asignados.

---

### **[41:01 - 42:05] Cierre: Consideraciones técnicas (AppSheet y XLSX)**

* **Docente / Evaluador:** Como comentario técnico final: habían considerado la subida de archivos `.xlsx`. Ojo con AppSheet; AppSheet trabaja de forma nativa con Google Sheets. Leer directamente las celdas de un `.xlsx` subido a veces tiene limitaciones en AppSheet sin una conversión previa a Google Sheets. Pruébenlo bien. Si no se puede directo, una alternativa es convertir el `.xlsx` a Google Sheet mediante una rutina y luego leerlo.  
Para la próxima semana preparen el prototipo no funcional de las pantallas. Muchas gracias.