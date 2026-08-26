# Changelog — v1.0.0 a v1.8.1 (primera versión mayor estable y su serie 1.x.x)

> Detalle completo de cada cambio desde el primer commit (0.1.0) hasta la última versión de la serie 1.x.x (1.8.1), justo antes de pasar a 2.0.0. Este archivo queda congelado tal cual — las versiones nuevas van en su propio archivo (`CHANGELOG-2.0.0.md` en adelante). Ver `CHANGELOG.md` para el índice de todos los archivos.

## 1.8.1 — "Copiar cómo usarlo" movido a la fila del campo (a la izquierda de "Editar")

- **Reubicado a pedido explícito**: el botón "Copiar cómo usarlo" de la v1.8.0 vivía dentro del editor expandido de cada campo (había que hacer clic en ✏️ "Editar propiedades" primero para verlo) — ahora es un ícono 📋 directo en la fila del campo, colocado a la izquierda de ✏️ "Editar", visible sin necesidad de desplegar nada. Al pasar el mouse por encima, el tooltip muestra exactamente el texto que se copiaría (expresión HTL + comentario de tipo); al hacer clic, se copia al portapapeles y el ícono cambia brevemente a ✅ como confirmación.
- Sigue sin aparecer para pestañas, agrupadores y encabezados (no representan ninguna propiedad JCR que copiar) — el resto de la lógica (tipo de dato por campo, multicampo usando el nombre del campo interno, campos "avanzados" con `name` legible) no cambió, solo dónde vive el botón.
- Verificado con Playwright sobre el HTML real generado por el panel: el ícono aparece en el orden correcto (Subir, Bajar, Copiar, Editar, Eliminar), el tooltip trae el texto exacto, el clic postea el mensaje `copyToClipboard` correcto y no aparece en la fila de un encabezado. No se pudo probar dentro de VS Code real desde este entorno.

## 1.8.0 — "Copiar cómo usarlo" en cada campo del editor de diálogos

- **Nuevo botón "📋 Copiar cómo usarlo"** en el editor de propiedades de cada campo (editor completo de diálogos): copia al portapapeles la expresión HTL típica para leer esa propiedad en el `.html` del componente — ej. para un `switch` con `name="./activeSwitch"`, copia `${properties.activeSwitch} <!--/* Boolean — true si está marcado/activado, false si no */-->` — con un comentario indicando el tipo de dato esperado, para que sea fácil identificar cómo tratarlo (String, Number, Boolean, Calendar, String[]...). Debajo del botón se muestra siempre una vista previa de lo que se copiará, y tras copiar aparece una confirmación breve "✔ Copiado".
- El comentario de tipo varía según el tipo de campo: `Boolean` para checkbox/switch, `Number` para campo numérico, `Calendar` (con sugerencia de `@ format=`) para selector de fecha, `String[]` para tags y multicampo (con nota de recorrerlo con `data-sly-list`), `String` con una aclaración para pathfield/pathbrowser (ruta) y file upload (ruta al asset). Los nombres de propiedad con caracteres que no son válidos en notación de punto (ej. con guiones) se copian con notación de corchetes (`${properties['nombre-raro']}`) en vez de romper la expresión.
- **Multicampo**: usa la propiedad real del campo interno repetido (no el contenedor, que a propósito no lleva `name` desde el fix de la v1.7.0) — y se actualiza en vivo si cambias el tipo o el nombre del campo interno sin necesidad de volver a abrir el editor.
- Sin botón para los tipos que no representan ninguna propiedad JCR (pestaña, agrupador, encabezado) — no tendría sentido copiar nada ahí.
- Campos de un tipo todavía no reconocido por la extensión ("avanzado") también muestran el botón si tienen una propiedad `name` legible en su XML crudo, con un comentario que invita a revisar el `sling:resourceType` real para confirmar el tipo de dato.
- Verificado con un navegador headless (Playwright) sobre el HTML real generado por el panel: switch, selector de fecha, multicampo (incluida la actualización en vivo al cambiar tipo/nombre del campo interno), campo oculto (con actualización en vivo al renombrarlo), un campo de tipo "avanzado" no reconocido, y confirmando que encabezado/agrupador no muestran el botón — además de una prueba directa del lado de la extensión confirmando que el mensaje `copyToClipboard` efectivamente llama a `vscode.env.clipboard.writeText` con el texto exacto. No se pudo probar dentro de VS Code real ni contra una instancia AEM real desde este entorno.

## 1.7.1 — Todos los comandos agrupados en un solo submenú "AEM Toolkit"

- **Reorganización de los menús contextuales**: hasta ahora cada comando (Subir a Author, Subir a Publish, Editar diálogo/AEM: Diálogo, Formatear XML, Compilar) aparecía como una entrada suelta en el menú contextual del Explorador y del editor, dando la impresión de ser varias extensiones distintas mezcladas entre sí. Ahora todos quedan agrupados bajo un único submenú **"AEM Toolkit"** (con el mismo ícono de la barra de actividad) que se despliega con una flecha, tanto al hacer clic derecho en el Explorador como dentro del código — dejando el resto del menú contextual de VS Code limpio, con una sola entrada nueva en vez de cuatro o cinco.
- Dentro del submenú, los comandos se mantienen agrupados y ordenados igual que antes (compilar → sincronizar → diálogo → formatear), solo que ahora como secciones separadas por una línea divisoria dentro del propio submenú en vez de en el menú contextual general. Ningún comando, `when` de aparición ni comportamiento cambió — es un cambio puramente de organización visual, vía la contribución `submenus` de `package.json` (`aemToolkit.explorerMenu` para el Explorador, `aemToolkit.editorMenu` para el editor).
- No se pudo probar dentro de VS Code real desde este entorno — conviene confirmar que el submenú se ve y despliega como se espera, y que no aparece vacío al hacer clic derecho en archivos sin relación con AEM (según el comportamiento estándar de VS Code, un submenú sin ítems visibles no debería mostrarse).

## 1.7.0 — Nuevo "AEM: Diálogo" (acceso rápido desde el código), fix real de multicampo, labels en inglés

- **Nuevo comando "AEM: Diálogo"**, disponible con clic derecho **dentro del código** de un `.content.xml` de diálogo abierto en el editor (no solo desde el Explorador como "AEM: Editar diálogo..."). Muestra un selector rápido con los 5 tipos de campo más usados — Textfield, Pathfield, Checkbox, Select (dropdown), Multifield — más una opción **"Edición avanzada"** que abre el editor visual completo de siempre. Pide la etiqueta del campo, detecta automáticamente si hay que elegir pestaña (pregunta solo si hay más de una; si el diálogo no usa pestañas, agrega directo a la raíz), guarda el archivo y ofrece subir el cambio a Author/Publish al toque, igual que el editor completo. El acceso desde el Explorador ("AEM: Editar diálogo...") no cambia — sigue abriendo siempre el editor completo.
- **Corregido un bug real de multicampo (`Multifield`)**: el nodo contenedor del multicampo llevaba, por error, su propia propiedad `name` con el MISMO valor que la de su campo interno repetido (`field`) — algo que Granite UI nunca genera así (según la convención real, solo el campo interno lleva `name`; el contenedor no). Esto es una explicación plausible del aviso de **"valor repetido"** que aparecía al agregar un multicampo y probarlo en AEM real: el navegador veía dos widgets enlazados a la misma ruta de propiedad. Se corrigió tanto al **crear** un multicampo nuevo (editor completo y "AEM: Diálogo") como confirmado que **editarlo** (cambiar tipo/etiqueta/nombre de su campo interno) ya funcionaba bien desde antes — ambos casos ahora se probaron con round-trip (crear → serializar → volver a interpretar) confirmando que el contenedor nunca lleva `name` y el campo interno sí, con el valor correcto.
- **Nombres de tipo de campo en inglés** (`fieldCatalog.ts`): Textfield, Textarea, Richtext (RTE), Number field, Pathfield, Pathbrowser, Select (dropdown), Radio group, Checkbox, Switch, Multifield, Date picker, File upload, Color field, Password, Hidden field, Tags, Heading, Tab, Fieldset — son los nombres con los que estos componentes de Granite UI se documentan y conocen normalmente, más fáciles de identificar que una traducción libre.
- **Errores de guardado ahora se ven en rojo** (y "Guardado" en verde) en el panel del editor completo — antes el mensaje de error se mostraba con el mismo estilo neutro que un guardado exitoso, lo que hacía difícil notar que algo había fallado.
- Nuevo módulo: `src/dialog/dialogQuickAdd.ts`. Verificado con pruebas de round-trip (multicampo nuevo sin `name` duplicado, campo agregado a la pestaña correcta eligiendo entre 2 pestañas, diálogo plano sin pestañas) simulando las respuestas de los QuickPick/InputBox de VS Code. No se pudo probar dentro de VS Code real ni contra una instancia AEM real desde este entorno.

## 1.6.0 — Nuevo comando "AEM: Formatear XML"

- **Nuevo comando "AEM: Formatear XML"**, disponible con clic derecho sobre uno o varios `.xml` dentro de `jcr_root` (Explorador o editor) — aplica el mismo estilo de formateo de la v1.5.0 (abertura + primer atributo en la primera línea, atributos adicionales uno por línea, cierre de etiqueta siempre en su propia línea alineado con su abertura) a **cualquier** archivo `.xml` de Document View del proyecto, no solo a los diálogos que abre el editor visual. No reescribe el archivo si ya estaba formateado igual (operación idempotente).
- **Corregido de paso**: hasta ahora, formatear/guardar un `.content.xml` siempre declaraba únicamente las 4 namespaces estándar (`jcr`/`sling`/`cq`/`nt`), sin importar cuáles tuviera el archivo — un archivo que además usara `granite`, `dam`, `wcmio`, etc. las hubiera perdido. Ahora se detectan las namespaces reales del archivo original y se preservan (combinadas con las 4 estándar, que siempre se garantizan). Aplica tanto al nuevo comando como al editor visual de diálogos.
- Nuevo módulo: `src/format/formatXmlCommand.ts`. Verificado con un fixture "desprolijo" (indentación inconsistente, todo en una línea, namespace extra, RTE anidado 5 niveles) confirmando que la namespace extra sobrevive, no quedan autocierres, y cada cierre queda alineado exactamente con su abertura en todo el árbol.

## 1.5.0 — Editor de diálogos: más tipos de campo, pestañas opcionales, XML reformateado

- **Catálogo de tipos ampliado** (`fieldCatalog.ts`): 10 tipos nuevos sobre los de v1.4.0 — selector de fecha (datepicker), grupo de opciones tipo radio (radiogroup), selector de ruta alternativo (pathbrowser), carga de archivo (fileupload), campo oculto (hidden), contraseña (password), selector de color (colorfield), interruptor (switch), encabezado estático (heading) y selector de tags. `select`/`radiogroup` comparten el mismo editor de opciones; `heading`/`hidden` tienen su propio editor reducido (sin etiqueta/nombre genéricos, ya que no aplican). El catálogo "avanzado" completo de Granite UI sigue pendiente para una versión posterior.
- **Pestañas ahora son opcionales de verdad**: un diálogo sin pestañas ya NO se envuelve en una pestaña "General" sintética (como hacía v1.4.0) — se edita con sus campos planos directo en la raíz. Aparece un botón **"+ Agregar pestañas"** para convertir esos campos en la primera pestaña cuando se necesite.
- **No se pueden anidar pestañas dentro de pestañas**: "Pestaña" se excluyó del selector genérico de "Agregar..." en cualquier nivel — la única forma de crear una pestaña es el botón dedicado ("+ Agregar pestañas" o "+ Pestaña" en la tira), que siempre agrega hermanas, nunca anidadas. Si se borran todas las pestañas, el diálogo vuelve solo a modo sin pestañas.
- **Nuevo: mover un campo a otra pestaña.** Con más de una pestaña, cada ítem muestra un botón "↪". Con exactamente 2 pestañas, mueve directo a la otra; con más de 2, primero pregunta a cuál moverlo.
- **XML reformateado** (`docviewSerializer.ts`), a pedido explícito: la etiqueta y su primer atributo van en la primera línea; si hay más de uno, los siguientes atributos se listan uno por línea (indentados un nivel más que la abertura) con el `>` pegado al último; con 0 o 1 atributo el `>` va en la misma línea; el cierre de etiqueta siempre queda en su propia línea (ya no se usa autocierre `/>`). Aplica a todo el archivo generado, no solo a los campos agregados en la sesión.
- Verificado con pruebas de round-trip (ida y vuelta con diálogos planos y con pestañas, creación de los 10 tipos nuevos, formato de indentación) y pruebas de interacción en navegador headless (conversión plano→pestañas con movimiento automático de campos, reversión al borrar la última pestaña, mover un campo con 2 y con 3+ pestañas). No se pudo probar dentro de VS Code real ni contra una instancia AEM real desde este entorno.

## 1.4.0 — Editor visual de diálogos (MVP del Bloque 19/20)

- **Nuevo comando "AEM: Editar diálogo..."**, disponible al hacer clic derecho sobre la carpeta `_cq_dialog` de un componente (o de una página/plantilla, mismo mecanismo) o directamente sobre su `.content.xml` — abre un panel dedicado con el diálogo representado visualmente como pestañas, cada una con su lista de campos.
- **Agregar, editar, reordenar y eliminar** pestañas, agrupadores con borde (fieldset) y campos, con un selector de 10 tipos: pestaña, agrupador, campo de texto, área de texto, texto enriquecido, campo numérico, selector de ruta, lista desplegable, casilla y multicampo. El modo "avanzado" con el catálogo completo queda para una versión siguiente — por ahora es intencionalmente solo este top 10.
- **Nunca destruye lo que no reconoce**: cualquier campo ya existente de un tipo fuera del top 10 se conserva tal cual (se puede reordenar/eliminar, pero no editar en detalle todavía) — el nodo XML original se preserva verbatim al guardar.
- **Guardar**: escribe el `.content.xml` en el disco automáticamente y, después de guardar, pregunta si quieres subir el cambio ahora mismo a Author o Publish (reutilizando la sincronización de diálogos con reemplazo total de la v1.3.0) — o dejarlo para más tarde.
- Simplificaciones deliberadas de esta primera versión (documentadas en detalle en `FEATURES.md`): los layouts de columnas (`fixedcolumns`) se aplanan a una sola columna al guardar; un diálogo sin pestañas se envuelve en una pestaña "General" implícita al abrirlo.
- Nuevos módulos internos: `src/dialog/fieldCatalog.ts` (catálogo de tipos), `src/dialog/dialogModel.ts` (árbol simplificado ⇄ árbol JCR real), `src/dialog/docviewSerializer.ts` (escribe Document View XML de vuelta a disco — antes la extensión solo sabía leerlo), `src/dialog/dialogPanel.ts` (el panel).
- Verificado con pruebas automatizadas: round-trip completo (parsear → editar → serializar → volver a parsear) contra el `.content.xml` real de `eventosgrid/_cq_dialog` de `italika-v2-cloud`, y la interacción real del panel (agregar, reordenar, editar, eliminar, guardar) ejecutada en un navegador headless. No se pudo probar dentro de VS Code real ni contra una instancia AEM real desde este entorno — se recomienda probarlo primero en un componente de prueba.

## 1.3.0 — Fix real: sincronizar un `.content.xml` (diálogos, etc.) no aplicaba los cambios

- **Causa raíz encontrada**: desde la 1.1.0, subir un `.content.xml` usaba el "Import Operation" del Sling POST Servlet con `:contentType=xml` — pero ese `contentType` NO entiende el formato "Document View" que usa FileVault en los `.content.xml` reales (el que empieza con `jcr:root`/`jcr:primaryType` como atributos); espera un formato completamente distinto heredado del bundle `jcr.contentloader`. La petición devolvía HTTP 200 sin error visible, pero no aplicaba los cambios de verdad — por eso, por ejemplo, agregar un campo nuevo a un diálogo de componente no se reflejaba en AEM aunque la extensión no avisara ningún error.
- **Arreglado de fondo**: la extensión ahora interpreta el `.content.xml` localmente (nodo por nodo, con sus propiedades y tipos — `{Boolean}`, `{Long}`, arreglos `[a,b,c]`, mixins, etc.) y reconstruye la subida como una serie de POSTs normales de Sling, uno por nodo — el mecanismo que sí entiende `jcr:primaryType` y cualquier propiedad como lo que son, sin depender de que el servidor interprete el XML crudo.
- **Diálogos de edición (`_cq_dialog`, incluida la de página/plantilla): reemplazo total.** Para estos archivos específicamente, la extensión borra el nodo del diálogo en el servidor y lo recrea completo desde el XML local — así que tanto los cambios como los campos que elimines del archivo quedan reflejados en AEM.
- **Cualquier otro `.content.xml`: solo crea/actualiza, nunca borra.** Si detecta (comparando contra la última versión commiteada en git — sin consultar el servidor) que el archivo perdió alguna propiedad o nodo respecto a esa versión, sincroniza igual lo que sí cambió y avisa que corras una compilación completa para aplicar la eliminación.
- Nueva dependencia en tiempo de ejecución: `fast-xml-parser` (más su única dependencia, `strnum`) para interpretar el XML — ambas empaquetadas dentro del `.vsix`.

## 1.2.0 — Detección automática del JDK requerido por el proyecto + ícono ⚙️ de configuración

- **Nuevo ⚙️** en la barra de acciones rápidas del panel de Compilar: abre un menú para detectar el JDK de nuevo, configurar las carpetas de búsqueda, configurar el JDK a mano, o abrir la configuración completa de la extensión.
- **Detección automática de la versión de Java que requiere el proyecto**: se lee de `maven.compiler.release`/`target`/`source` o `java.version` en el pom raíz y en los de cada módulo (la más alta encontrada).
- **Nueva opción `aemToolkit.jdkSearchFolders`** (máx. 2, workspace): carpetas "contenedoras" de varios JDKs (ej. `C:\Program Files\Java`, con subcarpetas `jdk-11`, `jdk-17`...). Si la versión de Java del sistema no coincide con la que el proyecto requiere, la extensión busca ahí una instalación que sí coincida (por su archivo `release`, el nombre de la carpeta, o como último recurso ejecutando su propio `java -version`) y la usa automáticamente — sin preguntar nada si la encuentra.
- **Banner de aviso en el panel**: si hay un choque de versión y no se pudo resolver solo (no hay `javaHome` manual ni una carpeta de búsqueda con la versión correcta), aparece un aviso arriba del panel indicando qué versión requiere el proyecto y cuál tiene el sistema.
- **Al compilar** (▶/⚡/Completa/Solo Back/Test-coverage Backend/acciones rápidas) con ese mismo choque sin resolver, se pregunta antes de lanzar Maven: *"El proyecto requiere Java X pero el sistema tiene Java Y. ¿Deseas continuar de todas formas?"* — con la opción de abrir la configuración ahí mismo en vez de solo cancelar. Si `javaHome` está configurado manualmente, o la extensión encontró un JDK automáticamente, no se pregunta nada — se usa directo.
- Texto de la configuración `aemToolkit.javaHome` recortado (la explicación extendida quedó en `FEATURES.md`).

## 1.1.3 — `aemToolkit.javaHome` ahora es explícitamente una configuración de workspace

- **Corregido**: `aemToolkit.javaHome` (agregado en 1.1.2) ahora se declara con `"scope": "resource"`, así queda explícitamente como una configuración de **workspace/proyecto** — se guarda en la pestaña "Espacio de trabajo" de Configuración (o en `.vscode/settings.json`) y solo aplica a ese proyecto. Cualquier otro proyecto que no la configure sigue usando el JDK por defecto del sistema, sin cambios (igual que si `javaHome` estuviera vacío). En un workspace multi-carpeta, incluso se puede configurar distinto por carpeta.
- Sin este `scope` explícito, la configuración ya funcionaba en la práctica (el valor por defecto de VS Code para una propiedad sin `scope` es `"window"`, que también admite guardarse por workspace) — el cambio la hace correcta y explícita como ajuste "por proyecto", en vez de depender de un default implícito.

## 1.1.2 — Fix real: la compilación fallaba por un JDK distinto al de IntelliJ, no por un bug de la extensión

- **Causa raíz encontrada**: el error de "Descargar dependencias" de la 1.1.1, y el mismo error al compilar normal (▶/⚡/Completa), no era ni un comando equivocado ni la limitación de dependencias entre módulos que se documentó en 1.1.1 — era un **JDK distinto**. La shell integrada de VS Code (bash/Git Bash) resuelve su propio `JAVA_HOME`/PATH, que en este caso apuntaba a un JDK más viejo que el que IntelliJ tenía configurado para el proyecto (`jdk-22`, fijado por IntelliJ de forma independiente al PATH del sistema). Un plugin de Maven compilado para Java más nuevo (ej. `bnd-maven-plugin`) falla con `UnsupportedClassVersionError` al correr bajo un JDK más viejo, aunque el comando `mvn` sea exactamente el mismo que usa IntelliJ.
- **Nueva opción `aemToolkit.javaHome`**: ruta a la carpeta del JDK que deben usar las Tasks de Maven del panel (ej. `C:\Program Files\Java\jdk-22`, el mismo que uses en IntelliJ para este proyecto). Cuando está configurada, la extensión antepone su `bin` al `PATH` y fija `JAVA_HOME` solo para esas Tasks — sin tocar la configuración global del sistema. Vacía por defecto = sin cambios de comportamiento, se sigue usando lo que la shell resuelva por su cuenta.
- Aplica a todas las acciones que compilan con Maven: ▶, ⚡, "Completa", "Solo Back", "Test-coverage Backend" y las acciones rápidas (📥/🗂️/🧹/🌳/🔍).

## 1.1.1 — Fix: mensaje confuso al fallar "Descargar dependencias" en un proyecto recién clonado

- **Corregido**: en un proyecto recién clonado, los íconos 📥 (Descargar dependencias), 🗂️ (Generar sources) y 🔍 (Analizar dependencias) podían fallar con un error crudo de Maven ("Could not resolve dependencies...") y dar la impresión de que la extensión intentaba compilar en vez de solo descargar. **No era un bug de qué comando se ejecuta** (📥 sí corre `mvn dependency:resolve`, no `clean install`): es una limitación real de Maven — estas acciones excluyen `ui.frontend` del reactor (igual que "Solo Back"), y si otro módulo depende del artefacto de `ui.frontend` (u otro hermano, ej. `core`) y ese hermano nunca se compiló ni se instaló en el repositorio Maven local, la resolución de dependencias falla aunque el comando en sí sea el correcto.
- Ahora, cuando esto pasa, se muestra un aviso claro con el paso a seguir: correr "▶ Compilar" (modo "Completa") una vez primero — después estas acciones funcionan normalmente porque esos artefactos ya están en la caché local. También se agregó esta misma explicación como pista permanente debajo de la barra de acciones rápidas, para adelantarse al problema en vez de solo explicarlo después del error.

## 1.1.0 — Bloque 2: Subir cambios de front sin compilar

- Nuevo: **"AEM: Subir a Author"** y **"AEM: Subir a Publish"**, disponibles al hacer clic derecho sobre un archivo o carpeta dentro de `jcr_root` (Explorador y editor). Un archivo sube solo ese archivo; una carpeta sube, de forma recursiva, todo lo que contiene.
- Sincroniza directo contra la **API POST de Sling** (sin Maven ni webpack de por medio): archivos `.content.xml` se importan como Document View XML reemplazando el nodo descrito; el resto de los archivos (HTML, CSS, JS, imágenes...) se sube como `nt:file`.
- Barra de progreso cancelable mientras sincroniza varios archivos, con un canal de salida ("AEM Toolkit — Sync") que registra el resultado (✔/✘) de cada uno.
- Nuevo comando **"AEM: Configurar credenciales de sincronización..."** (también en el árbol, bajo "Sincronizar"): host/puerto de Author y Publish son configuración normal (`aemToolkit.sync.*`, con `4502`/`4503`/`admin` precargados); la(s) contraseña(s) se guardan en VS Code Secret Storage, nunca en `settings.json`.
- Requiere que el nodo padre ya exista en el servidor — pensado para actualizar algo ya instalado antes con una compilación completa, no para crear estructura nueva desde cero.

## 1.0.0 — Primera versión estable (Bloque 1: Cimientos + Compilar)

Se marca como **1.0.0 estable** todo lo acumulado en las versiones 0.1.0 a 0.3.6 — detección de proyecto, el panel de compilar anclado en la barra lateral (modos, perfiles, destino Author/Publish, acciones rápidas estilo IntelliJ, detener una compilación en curso) y los comandos asociados. El detalle completo de esta versión, organizado por tema, está en `README.md`.

A partir de acá, las mejoras y funcionalidades nuevas se agregan como versiones **1.x.x**, hasta que se confirme un punto estable y se pase a **2.0.0** (sin perder la descripción de 1.0.0, que queda documentada de forma permanente en el README).

## 0.3.6 — Mensaje correcto al detener una compilación

- **Corregido**: al detener una compilación con ⏹ antes de que terminara, salía "...terminó con errores (código undefined)" — confuso, porque no fue un error real sino una cancelación manual. Ahora se distingue: al detenerla manualmente aparece un aviso claro tipo "⏹ Compilación detenida por el usuario." en vez del mensaje de error con código `undefined`. Aplica a todas las acciones que pueden detenerse (▶, ⚡, el resto de las acciones rápidas, y los pasos encadenados del wizard de Modo — ej. tests de front después de un build completo).

## 0.3.5 — Detener una compilación en curso

- Mientras hay una compilación corriendo (lanzada con ▶, ⚡ o cualquier acción rápida, o con el botón "▶ Compilar" del wizard de Modo), el ícono ▶ se convierte en un **recuadro rojo ⏹** — al pulsarlo, detiene la Task de Maven/npm en curso (`TaskExecution.terminate()`).
- Mientras tanto, el resto de los botones (acciones rápidas y el "▶ Compilar" del wizard) quedan deshabilitados, para no lanzar dos compilaciones a la vez sobre el mismo reactor.
- Al terminar la compilación — exitosa, con error, o detenida manualmente — el ícono vuelve a ▶ y todos los botones se re-habilitan automáticamente.

## 0.3.4 — Ícono ▶ Compilar (con tests)

- Nuevo ícono ▶ a la izquierda de ⚡, como el par ▶/⊘ de la ventana Maven de IntelliJ: **▶ Compilar** corre el reactor completo con los perfiles marcados **con** tests (back y front), mientras que **⚡ Compilar sin tests** hace lo mismo pero saltándolos — antes solo existía la versión sin tests.

## 0.3.3 — Ajustes a las acciones rápidas

- Se quitó el ícono ⚙️ de "goal personalizado" (poco útil en la práctica).
- Nuevo ícono 🔍 **Analizar dependencias** (`mvn dependency:analyze` — reporta dependencias usadas sin declarar y declaradas sin usar), igual que "Analyze Dependencies" en IntelliJ.
- **Corregido el alcance de "Compilar sin tests" (⚡)**: ahora corre el **reactor completo** (incluye `ui.frontend`) con los perfiles marcados, saltando los tests tanto de back como de front — antes solo compilaba el back. Así replica el comportamiento del ícono "ejecutar perfiles marcados sin tests" del panel Maven de referencia (equivalente al ▶ + el ícono de círculo tachado). El resto de las acciones rápidas (descargar dependencias, generar sources, limpiar, árbol y análisis de dependencias) siguen excluyendo `ui.frontend`, igual que "Solo Back".

## 0.3.2 — Acciones rápidas estilo Maven de IntelliJ

- Nueva barra de **íconos de acceso rápido** arriba del panel de compilar, al estilo de la ventana "Maven" de IntelliJ:
  - 📥 **Descargar dependencias** (`mvn dependency:resolve`)
  - 🗂️ **Generar sources y actualizar carpetas** (`mvn generate-sources`)
  - ⚡ **Compilar con los perfiles marcados, saltando tests** (`mvn clean install -DskipTests`)
  - 🧹 **Limpiar** (`mvn clean`)
  - 🌳 **Ver árbol de dependencias** (`mvn dependency:tree`)
  - ⚙️ **Ejecutar un goal de Maven personalizado...** (pide el goal con un input, ej. `help:effective-pom`, `versions:display-dependency-updates`)
- Todas usan los perfiles que estén marcados en ese momento en "Perfiles Maven" (no dependen del select de Modo) y excluyen `ui.frontend` del reactor, igual que "Solo Back", para no disparar de rebote un build de webpack.

## 0.3.1 — Panel anclado en la barra lateral + defaults por modo

- **"AEM: Compilar proyecto..." ya no abre una pestaña de editor** — el panel ahora vive **dentro de la misma barra de actividad** (debajo de "Acciones"), como una vista más de la extensión. Al ejecutar el comando, la vista se enfoca sola y (re)elige el proyecto si hay varios abiertos.
- **Los perfiles Maven ahora se marcan solos según el modo elegido** — incluyendo el modo "Completa" que carga por defecto al abrir el panel (antes solo pasaba con "Solo Back"). "Completa" y "Solo Back" marcan `autoInstallBundle`+`autoInstallPackage` si existen; "Test-coverage Backend" marca el perfil `coverage` si ya existe.
- **Los checks de "saltar tests" y el campo de argumentos extra también se reinician a su valor por defecto al cambiar de modo** (sin tests salteados, sin argumentos extra, destino "No aplica") — así nunca queda un valor de un modo anterior "pegado" al cambiar de modo. Los modos personalizados guardados siguen cargando exactamente lo que guardaste, sin verse afectados por este reinicio.

## 0.3.0 — Panel de compilación estilo IntelliJ (multi-perfil + coverage)

- **"AEM: Compilar proyecto..." ahora abre un panel** (en vez de una cadena de QuickPicks): un select de **Modo** arriba y los **perfiles Maven como checkboxes** debajo — ya puedes marcar `autoInstallBundle` y `autoInstallPackage` (u otros) al mismo tiempo.
- Modos: **Completa** (front+back+tests), **Solo Front** (con skip-tests de front si el proyecto tiene script de test), **Solo Back** (al elegirlo marca automáticamente `autoInstallBundle`+`autoInstallPackage` si existen, con tests incluidos y opción de saltarlos), **Test-coverage Frontend** y **Test-coverage Backend**.
- **Test-coverage Backend**: usa `git status` para ver si hay cambios en el back desde el último commit — si los hay, compila todo el back + tests; si no, solo re-corre los tests. Si el proyecto no tiene `jacoco-maven-plugin`, ofrece agregarlo automáticamente (perfil `coverage` en el pom raíz). Al terminar, muestra un panel con el % de coverage por clase, con buscador y filtro "menor a X%".
- **Test-coverage Frontend**: mismo panel de resultados, a partir de `ui.frontend/coverage/coverage-summary.json` (Istanbul/Jest) — solo aparece si el proyecto tiene un script de coverage configurado.
- La detección de perfiles ahora también lee los `pom.xml` de los submódulos de primer nivel (ej. el perfil `fedDev` que vive en `ui.frontend/pom.xml`), no solo el pom raíz.
- La ejecución ahora usa **VS Code Tasks** en vez de enviar texto a una terminal — permite encadenar pasos (build → tests) y esperar el código de salida real.
- Puedes **guardar el estado actual del panel como un modo personalizado con nombre** (perfiles, skip tests, destino, argumentos extra) y volver a elegirlo desde el mismo select más adelante, o eliminarlo con el ícono 🗑.
- Se quitó el comando separado "Compilar con perfil guardado..." — los modos guardados ahora viven dentro del propio panel.

## 0.2.0 — Destino Author/Publish al compilar

- El asistente "AEM: Compilar proyecto..." ahora pregunta, cuando eliges un perfil de instalación, si el destino es **Author** (puerto estándar 4502) o **Publish** (puerto estándar 4503), con host/puerto precargados con esos valores — basta Enter-Enter para usar los estándares.
- Si existe un perfil hermano dedicado a Publish (convención `<perfil>Publish`, ej. `autoInstallPackage` → `autoInstallPackagePublish`, como en gatesconnect-aem/gnp-solvimas/Repsol-Lubricantes), se usa automáticamente. Si no existe, se sobrescriben `-Daem.host`/`-Daem.port` como mejor esfuerzo y se avisa.
- Los perfiles favoritos guardados ya recuerdan el destino elegido (queda incluido en el perfil Maven y los argumentos resueltos).

## 0.1.1 — Fix: build de front por defecto sin minificar

- `aemToolkit.frontBuildCommand` ahora usa `npm run dev` por defecto en vez de `npm run prod`, para que el CSS/JS generado en "Solo Front" quede sin minificar y sea fácil de debuggear. Si prefieres el build minificado, cámbialo en la configuración de la extensión.

## 0.1.0 — Bloque 1: Cimientos + Compilar

- Detección de proyecto(s) AEM (módulos Maven, perfiles, `ui.frontend`, namespace).
- Vista en la barra de actividad con árbol de acciones.
- Asistente "AEM: Compilar proyecto..." (ámbito, perfil, skip tests, argumentos extra, guardar como favorito).
- "AEM: Repetir última compilación" y "AEM: Compilar con perfil guardado...".
- "AEM: Mostrar información del proyecto detectado".
