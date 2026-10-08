A continuación se presenta la transcripción completa y organizada por turnos de palabra, identificando los oradores (**Profesor** y **Estudiante**):

---

**[00:00] Profesor:**  
Una vez que ya está definido el, digamos, lo que decíamos, el plan, lo que hacemos es empezar a llenar y a colocar en el *sheet* cada uno de los docentes que van a dictar, ¿no?, para cada uno de los cursos en cada una de las carreras. Lo que estoy viendo es la vista de carga por carrera, ¿no? Y habría que empezar a tirar en, digamos, al director de departamento de Ingeniería; él tiene que ver todos los ítems que acá dicen DIMA, que es el departamento de Ingeniería. Tiene que ver todos los que digan DIMA y tiene que colocar quién va a ser el docente, ¿okay? Tendría que colocar el docente para todos los que digan DIMA en todas las carreras. Eso es lo que tendría que empezar a hacer, ¿okay?

Ahora, lo malo, lo incómodo de esto, es de que aparte, después uno tiene que revisar todo eso y pasar toda la información a la carga por departamento. En la carga por departamento se hace por... acá pones para cada docente cuáles son sus cursos, ¿no? Para cada docente. Eso es lo malo, porque uno lo empieza a llenar primero acá y después se supone que lo que está acá tienes que volcarlo por docente. Eso es bien incómodo y a veces hay errores ahí. Hay un tema de error; sí es habitual de que puedan haber errores acá. Así que a tomar en cuenta eso, por favor.

De repente lo primero podría ser de que para una interfaz es bonito esto de hacerlo por carrera, porque vas viendo que un docente vaya agregando algún elemento, bueno, un docente a qué curso va a ir, y acá está ordenado por cada una de las carreras en cada uno de los semestres, ¿no? Lo bueno de esta vista es de que acá te das cuenta qué carrera tiene algún curso o grupo sin docentes; eso es lo bueno, de primera te das cuenta si hay alguno que no tenga docente. Eso es lo bueno de esta vista.

Pero al final, para los departamentos es muy importante que tengamos de alguna forma esta visualización, donde esté para cada docente todos los cursos que dicta, y que tengamos esta información también es muy importante: cuál es la cantidad de horas que tiene cada docente. Lo malo es que la otra vista es buena para llenar, pero cuando nos piden información, nos piden esto, por docente, ¿okay?

Entonces, de repente en varias de sus propuestas, cuando vayan a ejecutar la carga lectiva, de repente van a permitir que esto se haga desde un *sheet* y después leer el *sheet*, ¿no? Y a partir de ese *sheet* darte información de, por ejemplo, esto de acá: por docente cuáles son sus cursos, docente por docente y por departamento, ¿no? Esta información de alguna forma tenemos que tenerla.

Y también en algún lado tenemos que ver esto de acá más tarde... bueno, yo creo que va a ser mejor en los reportes, todavía no. Creo que partimos con esto nada más: carga lectiva. Más adelante, cuando veamos reportes, sí esto va a ser necesario, por ejemplo, saber a nivel de reportes cuántas horas tiene cada docente en cada carrera; eso, por ejemplo, se ve acá: cuántas horas tiene en una carrera, en otra carrera, y así, ¿no? Eso a nivel de reportes. Pero en la parte operativa de la carga lectiva sí nos interesa sobre todo estos dos: para saber qué cursos les falta asignación —perdón, a qué carreras y a qué cursos les falta asignación— y por acá saber para cada docente cuántas horas tiene, ¿okay?

Y ahora hablemos un poquito de estas horas, porque acá van a haber algunas reglas que tomar... pero si hay una pregunta...

---

**[04:10] Estudiante 1:**  
Profesor, ¿nosotros debemos usar sí o sí este Excel o podemos alterarlo, aumentar cosas o quitar cosas?

**[04:18] Profesor:**  
A ver. Aumentar, sí. Quitar...

**[04:24] Estudiante 1:**  
O moverlas, por ejemplo.

**[04:26] Profesor:**  
¿Moverlas en formato?

**[04:29] Estudiante 1:**  
Sí.

**[04:30] Profesor:**  
Sí, bueno... Por ejemplo, ¿qué quisieras mover? El punto es de que también este formato como que ya está estandarizado para... lo maneja Secretaría y Rectorado. Entonces, a ver, pero por ejemplo, quisiera ver qué tipo de cambio quisieras.

**[04:47] Estudiante 1:**  
Es que estaba pensando más en hacerlo todo en una sola hoja de Excel y no en varias hojas.

**[04:55] Profesor:**  
Acá estas hojas están por departamento. Acá, digamos, estarían todos los docentes de Humanidades, en la foto. Acá están todos los docentes de Ciencias Jurídicas, por decir Derecho. Acá están todos los docentes de Ingeniería y Matemáticas. Y acá están todos los docentes de Administración.

**[05:16] Estudiante 1:**  
Claro, pero lo que creía es poner todo eso, claro, dividido por departamentos, pero en la misma hoja también poner cursos, alumnos matriculados en ese curso, todo en la misma hoja. O sea...

**[05:27] Profesor:**  
Ya, okay. Por ejemplo, en este momento cuando estamos haciendo la carga —por ejemplo, ahorita estaríamos haciendo la carga de 2017-1—, en este momento no sabes, no puedes adivinar cuáles son o van a ser los matriculados en el 2017-1. O sea que esa información que quieres incrustar no está, no va a estar. Y en realidad, como estamos haciendo la carga lectiva, la carga lectiva se va a dar y se va a modificar hasta el primer día de clases. Entonces, tú quieres colocar la data de los matriculados, pero va a ser la que se va a notar como un hueco; durante casi todo el semestre 2016-2 vamos a ver eso vacío. Y no se va a ver bien, ¿no? Porque alguien va a decir: «Oye, ¿pero para qué pones esa fila o columna? No me sirve, más bien está ocupando espacio».

---

**[06:12] Estudiante 2:**  
Profesor, una pregunta. Pero digamos, el sistema que estamos creando, ¿no sería más también para mostrar esa data? ¿Y esto solo sería como una base de datos de ordenamiento? ¿O sí o sí los usuarios van a ver el Excel?

**[06:27] Profesor:**  
Los usuarios van a ver... claro. En algún momento tenemos que pasar esa información a través de Excel. Ahora, recordemos algo: la carga lectiva es responsabilidad de los departamentos, de los directores de departamento, ¿ya? A ver, lo repito:

* Todos los asuntos que tengan que ver con docentes lo ve el **departamento académico**.  
* Todos los asuntos que tengan que ver con estudiantes lo ven los **coordinadores de carrera**, ¿okay? Los coordinadores de carrera.

Entonces, este objeto con el que estamos trabajando, ¿qué es? Carga lectiva. La carga lectiva es una responsabilidad en la cual asignamos docentes a los cursos. ¿Quién es el responsable de la carga lectiva? El director de departamento. En este contexto, ¿al departamento le concierne el manejo de estudiantes? No, no le concierne el manejo de estudiantes. El manejo de estudiantes sí le puede concernir al coordinador de carrera, pero no al director de departamento, ¿okay?

Por ese lado te diría: bueno, en todo caso si quieres poner información de estudiantes, claro, es informativo, puede servir, de acuerdo; pero prácticamente acá tenemos que hablar de docentes, no hablamos de estudiantes, ¿no? Yo sé que en algún momento converge, sí concierne de alguna forma cuando decíamos: «¿Cómo sabes cuántos grupos se van a abrir? Eso depende de la cantidad de estudiantes». Muy bien, pero eso ya lo dijimos antes, cuando estábamos haciendo el plan de ciclo. Cuando definimos el plan de ciclo, sí, ellos tenían que tomar en cuenta estimados, proyecciones, los coordinadores. Pero en este momento, cuando ellos ya me dijeron que son dos grupos, se acabó: yo solamente... no importa si esos dos grupos tienen 30 estudiantes o 20 estudiantes; a mí ya me dijeron que son dos y yo empiezo a poner docentes. No importa si hay grupos de 10 o grupos de 20; a mí me dijeron dos, son dos docentes, ¿okay? ¿Vale?

Entonces, por ese lado vamos separando: la parte de departamento tiene que ver puramente con docentes y el mundo de estudiantes tiene que ver más con el coordinador. En este caso nos importa la asignación de docentes, ¿okay? ¿Otra pregunta?

---

**[08:59] Profesor:**  
Okay, bueno, vamos a darle forma a esto. Bien, acá yo había colocado... este diagrama lo voy a actualizar después también en el Drive. Estaba viendo algunos elementos y ahora sí necesito que empecemos a hablar de algunas reglas, ¿ya? Quisiera que esas reglas, al momento que lo programen, estén de alguna forma puestas en algún código que se pueda actualizar, porque las reglas también pueden cambiar, ¿okay? Vamos a empezar a hablar de reglas en la asignación de docentes.

Primera regla... voy a ir hablando de reglas, ¿ya? Por favor, ahí si pueden ir tomando nota algún integrante del equipo. Cosas importantes:

A ver, primero: todos sabemos, ¿cuántas horas trabaja una persona normalmente en un trabajo? Ocho horas diarias. A la semana, ¿cuántas serían? 40, ¿no? 40 horas semanales. Normalmente debe ser 40 horas semanales, ¿okay? Cuando nosotros hablamos de la cantidad de horas que tiene un docente, lo que estamos colocando acá en este reporte es la cantidad de horas semanales. Es lo mismo que pasa con ustedes cuando tienen un curso, ¿no?: «¿Cuántas horas tiene un curso? Ah, este curso tiene seis horas». Si tiene seis horas, estamos hablando de seis horas semanales. «Nuestro curso tiene cuatro horas»: cuatro horas semanales. En el caso de hablar de trabajo, el docente, ¿cuánto trabajaría normalmente? Dentro de una semana, 40 horas, ¿okay?

Entonces, en el caso de los docentes pasa igual: **máximo podría tener 40 horas trabajando un docente a tiempo completo**. A eso lo llaman tiempo completo; trabaja 40 horas en la universidad. Esas 40 horas podrían llevarse en dos tareas, en dos grandes grupos: **horas lectivas** y **horas no lectivas**.
* **Horas lectivas:** tiene que ver con dictar cursos.
* **Horas no lectivas:** con labor administrativa. Por ejemplo, un director tiene que tener tiempo para asignar a los docentes. Un coordinador necesita tiempo para organizar eventos, para ver asuntos de los estudiantes; ahí también hay horas no lectivas. Un decano tiene que gestionar; también tiene horas no lectivas.

En la carga lectiva, ¿qué nos compete? Las horas lectivas nada más, no las no lectivas; solo horas lectivas, horas de dictado. Si tuviéramos un docente en el caso muy extremo que solamente dicta y no hace nada más, no podría haber un docente que dicte más de 40 horas. **Primera regla: en ningún caso, por ninguna razón, un docente va a tener más de 40 horas**, por más que sea el top de los tops y sea un gurú y sepa todo; no puede dictar más de 40 horas. No puede ocurrir eso, ¿okay?

El máximo entonces son 40 horas, que sería bien raro que alguien tenga 40 horas; en la práctica va a ser prácticamente imposible por las otras reglas que voy a decir. Ahora, ¿hay un mínimo? No hay un mínimo preestablecido, pero siempre se busca —entre paréntesis, en letras pequeñitas— que tenga **por lo menos 8 horas**, ¿ya? Eso no debe ser restrictivo de decir «no se permite menos de ocho»; sí se permite, pero tratemos de que no sea menos de ocho. ¿Por qué? Porque como en cualquier empresa, no te conviene contratar a una persona para que venga solamente dos o tres horas; te conviene una persona porque recordemos que cada docente tiene derechos y beneficios, entonces conviene tener menos personal. Procurar que sean de ocho para arriba, pero sí está permitido que sea menos; pueden haber docentes que dicten solamente un curso, sobre todo pasa con los internacionales, que normalmente dictan solo un curso.

Ahora, también sería bueno distinguir aquellos docentes que tienen cargos. Aquellos docentes con cargos tienen una cantidad de horas no lectivas. Normalmente diríamos que un docente con cargo acá en la universidad debe tener alrededor de 20 horas, no más de 20 horas. Hay casos que pueden llegar hasta 24 ya, pero más allá de eso, preferible no. O sea, que el sistema te brinde alertas: si va más allá de 24, alerta; ponlo en amarillo, resáltalo de alguna forma, muéstralo en algún reporte para chequear que el docente no esté teniendo demasiadas horas.

Otra regla: **un mismo docente no puede dictar dos cursos en el mismo semestre dentro de la misma carrera**, ¿okay? Solamente puede dictar un curso dentro de un semestre; no puede dictar dos cursos en un mismo semestre dentro de la misma carrera. ¿Sí? Eso también tomen en cuenta.

---

**[16:05] Estudiante 1:**  
¿Y en el caso de que hayan dos clases del mismo grupo o dos...?

**[16:13] Profesor:**  
Ah, ya, okay. Muy buena observación, buen análisis. Sí, si es el mismo curso en el cual se han abierto dos grupos, ahí sí está permitido de que el docente dicte en esos dos grupos, pero igual estamos hablando del mismo curso, ¿no? Es el mismo curso pero con diferentes grupos; no hay problema, sí sería permitido asignar al mismo docente en los dos grupos. Eso sí.

Ahora, ningún docente debe poder dictar más de 40 horas. De hecho, más de 24 cualquier docente ya es raro; no hay una regla tajante, pero mirar a un docente con más de 24 horas ya es raro. Alguna vez ha habido docentes que han llegado a 28 o de repente 30, pero más de 30 ya se ve observado y te lo van a rechazar.

Luego, de repente también sería bueno que entre las opciones que ustedes manejen en el sistema permitan colocar una opción para que el docente sea internacional sin saber su nombre. Porque en la universidad podemos pedir al área de Internacionalización que nos consiga el docente, y en ese momento diríamos que está pendiente esa confirmación; Internacionalización tiene que conseguir el docente, pero eso ya no depende del director de departamento, depende de Internacionalización, ¿okay? Entonces sí está permitido eso.

Habíamos hablado de controlar que no supere el máximo (40 horas semanales). Si supera las 24 horas, observarlo y mostrarlo de forma distintiva porque es demasiada carga. Si no alcanza el mínimo (menos de 8 horas), también marcarlo. Sería bueno que en cualquier momento en el sistema podamos ver para cada docente cuántas horas tiene y cómo están distribuidas, para ir viendo: «Ah, este docente tiene muy poquitas horas, tiene solo 10, le podemos aumentar», o «este docente ya está saturado, ya tiene más de 20, es demasiado».

Les comento algo más que de repente va a ser un poquito difícil de implementar, pero es de utilidad:  
Los docentes que vienen de otras universidades... Hay docentes que tienen tiempo completo en otras universidades (trabajan 40 horas allá), pero también vienen a trabajar acá. **En el caso de ellos, máximo deberían poder dictar acá 16 horas.** ¿Por qué? Porque en teoría, si ya eres tiempo completo en otra universidad trabajando 40 horas a la semana (8 horas por día), ¿cómo vienes acá y vas a dictar más de 16 horas? Va a ocurrir que va a faltar o algo.

---

**[21:16] Estudiante 2:**  
Profesor, ¿y eso está marcado en alguna parte? ¿Esa información ya está puesta de qué profesor viene de 40 horas de otra universidad?

**[21:22] Profesor:**  
Ese es el asunto: que nosotros no lo tenemos marcado, no lo tenemos automatizado. Uno lo sabe porque conoce al docente y sabe que trabaja en otro lugar, y tienes que preguntarle: «¿Eres tiempo completo o no?». Bueno, hay una parte documental donde se le pide que firme un documento de que no está en incompatibilidad, una declaración jurada. Pero para nosotros la lógica es: si trabaja a tiempo completo en otro lado, no puede trabajar acá más de 16 horas. En todo caso, su aplicativo tendría que tener marcado cuáles docentes tienen tiempo completo en otra universidad para no asignarles más de 16.

---

**[22:45] Estudiante 2:**  
Profesor, ¿y si por medio de un correo se le envía para confirmar esos datos automáticamente y un profesor miente para tener más horas acá y dice que no trabaja 40 horas? ¿Habría un problema legal o administrativo?

**[23:02] Profesor:**  
Sí. Por eso se les hace firmar una declaración jurada, y la declaración jurada es un documento legal. Si él no cumple lo que dice ahí, ya está incurriendo en una falta y sí puede ser procesado. La universidad puede levantarle un proceso; por esa razón, cuando presenta su declaración jurada, sabe que no puede mentir porque le podrían iniciar un proceso. Pero eso ya es un tema documental que escapa del sistema. En el sistema, el director sí debería poder marcar cuáles docentes son tiempo completo en otras universidades para que no superen las 16 horas.

Otro punto a tomar en cuenta: recuerden que cuando vayan a contabilizar las horas de cada docente, tomen en cuenta aquellos cursos que están fusionados; no le van a duplicar las horas. Si hay dos grupos que se fusionaron —por ejemplo, Doctrina Social de la Iglesia, que se dicta en Administración, en Software y en todas las carreras—, ahí se fusionan grupos y no le vas a duplicar o triplicar las horas al docente; se toma solamente una.

También tomen en cuenta los cursos en los cuales se divide la parte práctica. Por ejemplo, en Arquitectura: todos llevan la misma parte teórica (las horas de teoría son para todos), pero la parte práctica la dividen en grupos porque tienen un laboratorio con capacidad para pocas personas. Entonces, se duplican las horas prácticas, pero no las teóricas. Tengan cuidado de no duplicar esas horas en fusiones y en divisiones de práctica.

---

**[26:14] Estudiante 1:**  
Profesor, ¿eso solo es en Arquitectura?

**[26:18] Profesor:**  
No, considérenlo para cualquier carrera. Cuando hicimos el plan de ciclo dijimos que se podía aplicar donde sea. Hoy por hoy se está dando en Arquitectura, pero podría darse en otros lados. Por ejemplo, si en este curso se matriculan 50 y el laboratorio tiene capacidad para 40, no alcanza; pero si tenemos un aula de teoría para 60, los 60 hacen teoría juntos y para la práctica los dividimos en dos grupos de laboratorio.

---

**[26:58] Estudiante 1:**  
¿Podría existir grupos de solo práctica?

**[27:02] Profesor:**  
Si el curso tiene solamente horas prácticas en su diseño, sí podría haber grupos de solo práctica. Pero si el curso tiene horas de teoría, no puede haber un grupo que solo haga práctica; eso no podría ocurrir.

¿Alguna otra pregunta sobre el formato?

---

**[28:06] Estudiante 3:**  
Profesor, al inicio usted mencionó que si un docente no completaba ciertas horas de trabajo, ¿podía suplir un curso que no le perteneciese a su escuela, sino a otra escuela?

**[28:25] Profesor:**  
Sí, les refresco la idea: hay un curso de Estadística General que siempre se lo deberían pedir a Ingeniería y Matemáticas. Pero de repente dicen: «Necesito que mi docente, un ingeniero industrial que sabe de estadística, tome ese curso para completar sus horas». Ese caso ya se salvaba en el plan de ciclo: en vez de asignárselo a DIMA (Ingeniería y Matemáticas), la carrera definía que el curso lo iba a cubrir su propio departamento (por ejemplo, DACTEC) con su docente. Entonces, cuando viene la asignación, DIMA ya no lo llena; lo llena el departamento correspondiente.

---

**[30:10] Estudiante 1:**  
Profesor, ¿y en caso de que un docente tenga licencia por cualquier accidente o deba dar a luz? ¿También eso se tendría que ver?

**[30:21] Profesor:**  
Buen punto. ¿Cuál era el caso exactamente?

**[30:35] Estudiante 1:**  
Por ejemplo, la *miss* Lady tuvo licencia y después pasó el profesor Patiño a enseñar; ese curso duró creo que hasta antes del parcial.

**[30:43] Profesor:**  
Ah, ya con el semestre corriendo. Sería muy deseable que ustedes tengan un historial donde podamos ver con quién inició (con Lady) y después quién cambió (Luis Patiño). Actualmente solo queda la «última foto» y dice que el docente es Luis Patiño, pero eso es insuficiente porque la verdad completa es que casi la mitad la hicieron con Lady y el resto con Luis Patiño. 

Ahora, para la carga lectiva oficial queda el que está al final, Luis Patiño, porque el docente que quedó hasta el final es el que va a firmar las actas; él es el titular.

---

**[32:06] Estudiante 1:**  
¿Y no tendrían que firmar ambos en el acta si uno enseñó hasta el primer parcial?

**[32:14] Profesor:**  
No, actualmente firma el que queda al final. Pero sería bueno que el sistema tenga ese historial. También puede ocurrir que un docente sea operado y se ausente un mes; se le asigna un reemplazo temporal, pero como el titular regresa y termina el semestre, él firma las actas y queda registrado al final.

---

**[33:38] Estudiante 1:**  
Pero al final el reemplazo ya no quedaría, ¿no? Solo en el historial.

**[33:43] Profesor:**  
Sí, solo en el historial; el que queda al final es el docente de la carga lectiva.

¿Otro caso? ¿Alguno ha tenido cátedra compartida? Se habla de cátedra compartida cuando en un mismo curso enseña más de un docente.

---

**[34:30] Estudiante 4:**  
Hubo un reemplazo nada más una vez: el profesor titular no pudo asistir y mandó a otro profesor.

**[34:38] Profesor:**  
Ya, eso es reemplazo temporal, no cátedra compartida.

---

**[34:48] Estudiante 1:**  
En el caso de la profesora Lady con el profesor Bosa...

**[34:56] Profesor:**  
¿Él la reemplazó completamente?

**[35:03] Estudiante 1:**  
Al inicio no; tuvo primero las horas teóricas la profesora Lady y las prácticas el profesor...

**[35:09] Profesor:**  
Ah, esa sí es cátedra compartida: un docente dicta las horas de teoría y otro docente dicta las horas de práctica. A un docente le sumamos las horas teóricas y al otro las horas prácticas.

---

**[35:30] Estudiante 3:**  
Profe, ¿y en el caso de la profesora Maribel cuando estaba a punto de dar a luz? En el sistema aparecía con su carga, pero luego se retiró y tuvieron que terminar con otro profesor. Si el profesor que va a suplir ya está en el sistema con su máximo de horas (por ejemplo, ya tiene 20 horas), ¿cómo se haría? Porque capaz la universidad busca cubrir con alguien que ya esté en planilla o la profesora manda a alguien. ¿Al final cómo quedaría?

**[36:36] Profesor:**  
Para el docente reemplazante siempre rigen las mismas reglas:
* Por ninguna razón puede tener más de 40 horas.
* Si supera las 24 horas, se le alerta, aunque sí se permite.
* Si es docente a tiempo completo de afuera y supera las 16 horas, no se le permite.

Las reglas se respetan igual, aunque sea un reemplazante. En el peor de los casos, si ningún docente actual puede cumplirlo sin violar las reglas, se tendría que contratar a otro docente.

---

**[37:42] Estudiante 1:**  
Profesor, ¿y en el caso del curso por jurado cuando un profesor es asignado?

**[37:49] Profesor:**  
Buena pregunta. En el caso de curso por jurado, las horas no puntúan acá y no se consideran en la carga lectiva, porque no son horas semanales; se toman solo dos evaluaciones en todo el semestre. Eso va aparte.

Entonces, el caso de uso consiste en asignar docentes según el plan de ciclo, pero controlando en todo momento cuántas horas tiene cada docente, alertando si tiene muy pocas o si tiene muchas, y no permitiendo más de 40 horas (o más de 16 horas para externos a tiempo completo). Y la otra regla: **un mismo docente no puede enseñar dos cursos de un mismo semestre dentro de la misma carrera.**

---

**[39:32] Estudiante 5:**  
Profesor, y como explicaba mi compañero, si una profesora se retira y no hay quien supla, ¿un docente del mismo semestre no podría enseñar en su reemplazo?

**[39:50] Profesor:**  
Igual se respeta: no puede ser, ni por reemplazo ni por urgencia. No se va a dar. Por eso les decía que en su programación pongan las reglas de negocio aparte para poder actualizarlas si cambian.

Ahora, una figura que sí se permite: **el docente puede enseñar más de un curso en el mismo semestre, pero en diferentes carreras.** Por ejemplo, Informática del segundo semestre en Psicología e Informática del segundo semestre en Administración; son semestres de planes de estudio distintos, ahí sí vale. Lo que no se puede es dos cursos del mismo semestre dentro de la misma malla curricular.

---

**[42:25] Estudiante 1:**  
Profesor, ¿y si los profesores tienen trabajo en una empresa, también se le tendría que controlar el horario a 16 horas?

**[42:37] Profesor:**  
No, acá no controlamos horarios de empresas privadas; eso se coordina al momento de fijar horarios con el docente. Y si luego no cuadra su horario, se le reemplaza. Lo de las 16 horas aplica exclusivamente entre universidades: si tiene tiempo completo (40 horas) en otra universidad, no puede dictar más de 16 aquí. Si trabaja en una empresa de software a tiempo completo, no aplica esa restricción; ahí sí podría dictar más de 16, siempre que cumpla con sus horas.

---

**[44:59] Estudiante 1:**  
Profesor, el profesor Yasser tiene tres grupos diferentes (mañana, tarde y noche) para el curso de Evolución. Si no puede enseñar en la mañana, ¿ese grupo de la mañana puede ser ocupado por otro profesor?

**[45:19] Profesor:**  
Son grupos distintos; claro que pueden tener docentes diferentes. Aunque en realidad los cursos suelen estar asignados a una franja horaria específica (turno mañana, tarde o noche).

**[46:08] Estudiante 1:**  
Pero en el caso de Evolución con el profesor Yasser...

**[46:12] Profesor:**  
Ah, buen punto. Lo que pasa es que existe «Evolución y Mejora de Procesos» y existe «Evolución para la Mejora de Procesos»; son dos cursos diferentes con distinta cantidad de horas y mallas. Por eso parece el mismo dictándose en varios turnos, pero formalmente son asignaturas distintas.

---

**[47:16] Estudiante 1:**  
A la hora de incluir un profesor para la carga, si viene contratado de afuera, ¿se ingresa mediante un formulario con nombre, DNI, etc.?

**[47:32] Profesor:**  
De momento, para su aplicativo consideren que los docentes ya están registrados en la base de datos y solo los seleccionan. En la vida real sí se llena una ficha: una para docentes nacionales y otra para internacionales (a quienes se les piden datos bancarios del exterior, estatus migratorio, etc.). Pero para el prototipo que están desarrollando, asuman que todos se seleccionan de una base de datos ya existente.

Listo, eso sería todo por hoy y nos vemos mañana. ¡Gracias!