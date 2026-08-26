# AEM Toolkit — Especificación funcional y roadmap

> Extensión de VS Code para acelerar el desarrollo en proyectos AEM (arquetipo Maven estándar: `core` / `ui.apps` / `ui.content` / `ui.config` / `ui.frontend` opcional / `dispatcher` / `all`). Este archivo es la fuente de verdad de todo lo que se va a construir, para que ninguna idea se pierda entre bloques. Se actualiza en cada bloque: lo hecho se marca `[x]`, lo pendiente queda `[ ]`.
>
> Proyectos de referencia analizados: **gatesconnect-aem**, **gnp-solvimas**, **Repsol-Lubricantes** (y `repsol-portugal`/`gnp-dispatcher`/`gates-aem-dispatcher` como dispatchers hermanos). Todos comparten el arquetipo Maven de Adobe: módulos `all/core/ui.apps/ui.apps.structure/ui.config/ui.content/it.tests/ui.tests`, con `ui.frontend` presente solo en algunos (ej. gatesconnect-aem y gnp-solvimas sí lo tienen; Repsol-Lubricantes no) — la extensión debe **detectar** esto en vez de asumirlo.

## 0. Arquitectura de la extensión

Se sigue el mismo patrón que ya usas en `angular-schematics-free` (mismo repo `extensiones-visual-studio`, rama `feature/aem-toolkit`):

- TypeScript + `vscode` API, compilado con `tsc`, empaquetado con `@vscode/vsce` (`npm run package` → `.vsix`).
- Icono propio en la **barra de actividad** (izquierda, junto a Explorador/Extensiones) con un `viewsContainers.activitybar`, y una vista de árbol (`TreeDataProvider`) que expone todos los comandos organizados por categoría — igual que el árbol "Generadores" de Angular Schematics Free.
- Un comando por funcionalidad (para Command Palette y `keybindings`), agrupados también en menús contextuales (`explorer/context`, `editor/context`) con clausulas `when` para que solo aparezcan donde tienen sentido (ej. "Nuevo componente" solo sobre carpetas dentro de `ui.apps/.../components`).
- `config.ts` centraliza toda la configuración (`aemToolkit.*` en `settings.json`), igual que `angularSchematicsFree.*`.
- **Buscador/filtro en todas las listas de selección**: cualquier `QuickPick` con más de ~6 opciones (componentes existentes, plantillas, campos de diálogo, perfiles Maven, idiomas, tags…) usa `vscode.window.showQuickPick` con `matchOnDescription`/`matchOnDetail` activados y una `placeHolder` que invite a escribir para filtrar. Para selecciones más ricas (formularios de content fragment, tags, diálogos) se usa un **Webview** con un `<input>` de filtro en vivo sobre listas largas (tipos de campo, componentes del proyecto, idiomas).

## 1. Roadmap por bloques (ordenado por complejidad, de menor a mayor)

Cada bloque se construye, se prueba en un proyecto real (gatesconnect-aem / gnp-solvimas / Repsol-Lubricantes) y se comitea antes de pasar al siguiente. El orden es por **complejidad de implementación**, no por prioridad de uso — dos bloques marcados como "elegido para empezar" se adelantan porque son la base de todo lo demás.

| # | Bloque | Complejidad | Estado |
|---|--------|:---:|---|
| 1 | Cimientos: detección de proyecto (multi-módulo, ¿tiene `ui.frontend`?) + vista en barra de actividad + **Compilar proyecto** (front/back/ambos, perfiles, skip tests) | Baja–Media | ✅ v1.0.0 (estable) |
| 2 | **Subir cambios de front sin compilar** (HTML/clientlibs/XML directo al JCR) | Baja–Media | ✅ v1.1.0 (sync de `.content.xml` corregido de fondo en v1.3.0) |
| 3 | Crear **tags** (formulario + instrucciones de uso) | Baja | ⏳ |
| 4 | Crear **data-sly-template** en `components/utils` | Baja | ⏳ |
| 5 | Crear **Content Fragment Model** (formulario de atributos + instrucciones de uso) | Media | ⏳ |
| 6 | **Formatear HTL** (indentación automática por apertura/cierre de etiqueta) | Media | ⏳ |
| 7 | Ir a definición: abrir modelo desde `data-sly-use.model` | Baja–Media | ⏳ |
| 8 | Modularizar HTML: seleccionar texto → `data-sly-template` o archivo aparte + `data-sly-include` | Media | ⏳ |
| 9 | Reusar componente existente vía `data-sly-resource` (con id único anti-colisión) | Media | ⏳ |
| 10 | Crear **template de página** (nueva o basada en existente, propiedades por defecto o extendidas) | Media | ⏳ |
| 11 | Crear **Experience Fragment** (componente nuevo o existente) | Media | ⏳ |
| 12 | Editar template de página (agregar componentes, cambiar HTML, clases distintivas) | Media–Alta | ⏳ |
| 13 | Crear **modelo Sling** (normal o consumiendo servicio, con clases/interfaces) | Media–Alta | ⏳ |
| 14 | Crear **servlet** (GET/POST/PUT/DELETE/PATCH) | Media–Alta | ⏳ |
| 15 | Seleccionar texto → convertir a **i18n** (multi-idioma, modal, sustitución, edición posterior) | Media–Alta | ⏳ |
| 16 | Renombrar componente (archivos + modelo + react/angular) | Media–Alta | ⏳ |
| 17 | Crear **componente** completo (versionado, modelo, react opcional, css/js según `ui.frontend`) | Alta | ⏳ |
| 18 | Generar **componente React/Angular** desde un componente ya creado (ajusta modelo, hashmap/mapper estilo `Cart.java`) | Alta | ⏳ |
| 19 | **Diálogos**: formulario dinámico de campos (multifield, pathfield, switch, select, richtext…), visibilidad condicional, extensión de css/js, sincronización con el modelo | Muy alta | 🟡 MVP en v1.4.0 (ver 3.10) |
| 20 | Editar diálogos existentes + selección múltiple de componentes para unificar propiedades en tabs/multifield | Muy alta | 🟡 edición de uno solo cubierta por el MVP de v1.4.0 (ver 3.11); selección múltiple sigue ⏳ |
| 21 | Diagnósticos en vivo de HTL (etiquetas sin cerrar, errores de sintaxis tipo "Error Lens") | Alta | ⏳ |
| 22 | (Opcional, si es viable) Editar qué contenido se cachea/excluye (dispatcher) | Baja–Media | ⏳ |

## 2. Convenciones detectadas en los proyectos de referencia

- **Maven multi-módulo**: `pom.xml` raíz declara `<modules>` — típicamente `all, core, ui.frontend?, ui.apps, ui.apps.structure, ui.config, ui.content, it.tests, ui.tests`. `ui.frontend` es opcional (Repsol-Lubricantes no lo tiene → sus componentes usan clientlibs "clásicos" con CSS/JS directos en `ui.apps`, sin webpack).
- **Perfiles Maven estándar** encontrados en el pom raíz: `autoInstallBundle` (solo el bundle OSGi, rápido), `autoInstallPackage` (paquete de contenido completo), `autoInstallPackagePublish`, y compilación simple sin perfil (`mvn clean install`, sin desplegar a ninguna instancia).
- **`ui.frontend/package.json`** típico trae scripts `dev`, `prod`, `start` (webpack-dev-server), `watch` (`npm-run-all --parallel start chokidar aemsyncro`), `sync`/`aemsyncro` (vía `aemsync`) y a veces un script `push` que llama a una CLI de vault (`vlt`/`filevault-content-package-maven-plugin` o similar) contra una ruta de clientlib concreta. **Compilar "solo front"** = correr estos scripts npm dentro de `ui.frontend` sin pasar por el reactor Maven completo; **"solo back"** = `mvn clean install -pl '!ui.frontend'` (o `-pl core,ui.apps,...`) para no disparar el build de webpack.
- **Componentes** viven en `ui.apps/src/main/content/jcr_root/apps/<namespace>/components/<nombre>[/v1|v2]/<nombre>`, con `_cq_dialog`, `_cq_design_dialog` y a veces `_cq_template`/`new` (versión inicial "in construction"). El versionado (`v1`, `v2`…) es una convención propia del proyecto, no del arquetipo — la extensión debe **preguntar** si se versiona o no.
- **Modelos Sling** en `core/src/main/java/com/<empresa>/<proyecto>/core/models/<nombre>[/v1]/`, con subcarpetas por versión igual que el componente. `Cart.java` (gatesconnect-aem) es el ejemplo de modelo que expone datos a un componente React vía un `HashMap`/mapper para hidratar el estado inicial del bundle JS — patrón a replicar en el bloque 18.
- **`components/utils`** (ej. `gatesconnect-aem/ui.apps/.../apps/gatesconnect/components/utils`) es donde viven los `data-sly-template` compartidos entre componentes.
- **i18n**: diccionarios como nodos `sling:MessageEntry` bajo `i18n/<idioma>` en `ui.content` (o `ui.apps`), una entrada por `sling:key`/`sling:message`.

## 3. Detalle de las funcionalidades y decisiones de UX

### 3.1 Compilar proyecto (Bloque 1)
Panel **anclado en la propia barra de actividad de la extensión** (una vista más, debajo de "Acciones" — no una pestaña de editor aparte ni una cadena de QuickPicks), al estilo de una configuración de ejecución de IntelliJ: un **select de Modo** arriba y, debajo, los **perfiles Maven como checkboxes** (se pueden marcar varios a la vez, ej. `autoInstallBundle` + `autoInstallPackage` juntos — algo que un único QuickPick no permitía bien). Al ejecutar "AEM: Compilar proyecto...", la vista se enfoca sola en la barra lateral y (re)elige el proyecto si hay varios abiertos; si el panel aún no se había abierto nunca, muestra primero un estado vacío con un botón "Elegir proyecto" (para no disparar el selector de proyecto sin que el usuario lo pida).

Modos disponibles:
1. **Completa**: front + back + tests (de back, y de front si el proyecto tiene un script de test en `ui.frontend/package.json`). Corre el reactor Maven completo y, si aplica, los tests de front después. Es el modo que carga por defecto al abrir el panel.
2. **Solo Front**: corre `aemToolkit.frontBuildCommand` (por defecto `npm run dev`, sin Maven). Si hay script de test de front, se puede saltar con un checkbox.
3. **Solo Back**: al elegir este modo se **desmarcan todos los checkboxes y se marcan automáticamente `autoInstallBundle` y `autoInstallPackage`** (los que existan en el proyecto). Corre con tests incluidos por defecto; el usuario puede desmarcar "Saltar tests de Back" para incluirlos, o marcarlo para saltarlos.
4. **Test-coverage Frontend**: solo aparece habilitado si `ui.frontend/package.json` tiene un script de coverage (ej. uno que corra con `--coverage`). Lo corre y muestra el reporte (ver abajo).
5. **Test-coverage Backend**: usa `git status --porcelain` para detectar si hubo cambios en el back desde el último commit guardado. Si los hay, compila todo el back + tests; si no, solo re-corre los tests (para no perder tiempo recompilando). Si el proyecto no tiene `jacoco-maven-plugin` configurado, se ofrece agregarlo automáticamente como un perfil `coverage` en el pom raíz (heredado por todos los módulos, igual que `autoInstallBundle`/`Package`) — y ese perfil `coverage`, una vez existe, se marca solo al elegir este modo. Al terminar, se muestra un panel con el **% de coverage de líneas por clase**, con buscador por nombre y un filtro "mostrar coverage menor a X%" para ubicar rápido los modelos con poca cobertura. Los tests no se pueden saltar en este modo (son necesarios para calcular coverage).
6. El usuario puede **guardar el estado actual del panel como un modo personalizado con nombre** (perfiles marcados, skip tests de front/back, destino Author/Publish, argumentos extra) — aparece después en el mismo select, bajo "Modos personalizados", y se puede eliminar con el ícono 🗑.

**Perfiles y demás valores por defecto según el modo**: cada modo base trae asociados los perfiles que normalmente necesita para instalar (Completa y Solo Back → `autoInstallBundle`+`autoInstallPackage` si existen; Test-coverage Backend → `coverage` si ya existe) y los marca automáticamente al elegirlo — **incluyendo el modo "Completa" que carga por defecto al abrir el panel** (antes esto solo pasaba en "Solo Back"). Al cambiar de modo también se reinician a su valor por defecto los checks de "saltar tests" (front/back, sin saltar), el campo de argumentos extra (vacío) y el destino de despliegue ("No aplica"), para que nunca quede un valor de un modo anterior "pegado" en la UI. Los modos personalizados guardados no se ven afectados por este reinicio: siguen cargando exactamente los valores con los que se guardaron.

Para los modos que instalan en una instancia (Completa/Solo Back), se muestra además el **destino Author (puerto `4502`) / Publish (puerto `4503`) / No aplica**, con host/puerto precargados con esos estándares (ver perfil hermano `<perfil>Publish`, igual que antes). La detección de perfiles lee tanto el `pom.xml` raíz como los `pom.xml` de los submódulos de primer nivel (ej. `fedDev`, definido dentro de `ui.frontend/pom.xml` en gatesconnect-aem), para que ningún perfil "escondido" en un submódulo se quede fuera de la lista.

La ejecución corre como una **VS Code Task** (no un simple `sendText` a una terminal) — el usuario sigue viendo el output real en un panel de terminal, pero esto permite encadenar pasos (ej. build → tests) y saber si terminó bien antes de continuar (ej. antes de leer el reporte de coverage).

**Acciones rápidas (estilo ventana "Maven" de IntelliJ)**: arriba del select de Modo hay una fila de íconos para operaciones puntuales de Maven que no dependen del wizard de Modo/perfiles, igual que la barra de herramientas del panel Maven de IntelliJ:
- 📥 Descargar dependencias (`mvn dependency:resolve`).
- 🗂️ Generar sources y actualizar carpetas (`mvn generate-sources`).
- ▶ Compilar con los perfiles marcados abajo — **reactor completo, incluye `ui.frontend`** —, con tests (`mvn clean install`). Es el equivalente al ícono "ejecutar perfiles marcados" del panel Maven de referencia.
- ⚡ Compilar con los perfiles marcados abajo — reactor completo —, saltando los tests tanto de back como de front (`mvn clean install -DskipTests`). Es el equivalente al ícono "ejecutar perfiles marcados sin tests" (▶/⊘) del panel Maven de referencia.
- 🧹 Limpiar (`mvn clean`).
- 🌳 Ver árbol de dependencias (`mvn dependency:tree`).
- 🔍 Analizar dependencias — declaradas sin usar / usadas sin declarar (`mvn dependency:analyze`), igual que "Analyze Dependencies" en IntelliJ.

Todas usan los perfiles que estén marcados en ese momento en la sección "Perfiles Maven" (no el modo elegido en el select). Descargar dependencias, generar sources, limpiar, árbol y análisis de dependencias excluyen `ui.frontend` del reactor (`-pl !ui.frontend -am`), igual que "Solo Back", para no disparar de rebote un build de webpack al pedir algo puramente de Maven — las excepciones son ▶ Compilar y ⚡ Compilar sin tests, que sí incluyen `ui.frontend` a propósito (ver arriba).

**Detener una compilación en curso**: mientras hay una Task de Maven/npm corriendo (lanzada desde ▶, ⚡, cualquier acción rápida, o el botón "▶ Compilar" del wizard de Modo), el ícono ▶ se transforma en un **recuadro rojo ⏹** — al pulsarlo, se llama a `TaskExecution.terminate()` sobre la Task en curso. Mientras tanto, el resto de los botones del panel quedan deshabilitados (no se pueden lanzar dos compilaciones en paralelo sobre el mismo reactor). Al terminar — bien, con error, o detenida manualmente — el ícono vuelve a ▶ y todo se re-habilita solo. Cuando se detiene manualmente, el mensaje final lo dice explícitamente ("⏹ ... detenida por el usuario.") en vez de mostrarlo como un error con código `undefined` (que es lo que reporta VS Code cuando una Task se termina a la fuerza en vez de salir sola).

**JDK usado al compilar — v1.1.2/1.1.3, con detección automática desde v1.2.0**: todas las Tasks de Maven que lanza el panel (▶, ⚡, y las acciones rápidas) corren en la shell integrada de VS Code (bash/Git Bash, cmd, etc.), que resuelve su propio `JAVA_HOME`/PATH — **no necesariamente el mismo JDK que un IDE como IntelliJ**, que permite fijar el JDK del proyecto de forma independiente al PATH del sistema. Si son distintos, un plugin de Maven compilado para una versión de Java más nueva que la que trae esa shell por defecto falla con `UnsupportedClassVersionError` aunque el comando `mvn` ejecutado sea idéntico al de IntelliJ.

Flujo completo (`src/compile/javaResolver.ts`):
1. **Versión requerida**: se lee de `maven.compiler.release`/`target`/`source` o `java.version` en el pom raíz y en el de cada módulo (la más alta encontrada) — queda en `AemProjectInfo.requiredJavaVersion`.
2. **Versión del sistema**: se detecta corriendo `java -version` (respetando `JAVA_HOME` si está seteado), sin ninguna configuración de la extensión de por medio.
3. Si **`aemToolkit.javaHome`** está configurado a mano, gana siempre — no se hace ninguna detección ni se pregunta nada.
4. Si no, y la versión requerida coincide con la del sistema, tampoco pasa nada — se usa el JDK del sistema tal cual.
5. Si no coinciden, se busca en **`aemToolkit.jdkSearchFolders`** (máx. 2, carpetas "contenedoras" de varios JDKs, ej. `C:\Program Files\Java` con subcarpetas `jdk-11`, `jdk-17`...) una instalación cuya versión coincida — por su archivo `release` (JDK 9+, sin lanzar procesos), el nombre de la carpeta, o como último recurso ejecutando su propio `java -version`. Si encuentra una, la usa automáticamente (antepone su `bin` al `PATH` y fija `JAVA_HOME` solo para esa Task) sin preguntar nada.
6. Si tampoco se encuentra ninguna que coincida, el panel muestra un **banner de aviso** arriba ("⚠ El proyecto requiere Java X pero el sistema tiene Java Y...") y, al intentar compilar, se pregunta *"¿Deseas continuar de todas formas?"* con la opción de abrir la configuración ahí mismo.

**Ícono ⚙️** en la barra de acciones rápidas: abre un menú (detectar de nuevo, configurar las carpetas de búsqueda, configurar el JDK a mano, o abrir la configuración completa de la extensión). `aemToolkit.javaHome` y `aemToolkit.jdkSearchFolders` son configuraciones de **workspace** (`"scope": "resource"`): cada proyecto fija lo suyo (o nada) sin afectar a los demás.

### 3.2 Subir cambios de front sin compilar (Bloque 2) — ✅ v1.1.0, sincronización de `.content.xml` corregida de fondo en v1.3.0
Sincroniza archivos directo al JCR sin pasar por Maven ni webpack, usando la **API POST de Sling** directamente contra Author o Publish.

- **Disparador**: clic derecho sobre un archivo o carpeta dentro de `ui.apps/.../jcr_root/...` (menú `explorer/context` y `editor/context`, visible solo cuando la ruta contiene `jcr_root`) → **"AEM: Subir a Author"** o **"AEM: Subir a Publish"**. Si es un archivo, sube solo ese archivo; si es una carpeta, recorre recursivamente todo su contenido y sube cada archivo encontrado.
- **Ruta JCR real**: se calcula a partir de la ruta local recortando todo lo anterior a `jcr_root` y decodificando la convención "platform" de FileVault (`_cq_dialog` → `cq:dialog`, `_jcr_content` → `jcr:content`) en cada segmento.
- **Archivos `.content.xml` (`src/sync/docview.ts` + `src/sync/contentXmlSync.ts`) — reescrito en v1.3.0**: hasta la v1.2.0 se subían con `:operation=import`/`:contentType=xml` del Sling POST Servlet, que resultó ser **el bug real**: ese `contentType` no entiende el formato Document View de FileVault (heredado en cambio del bundle `jcr.contentloader`, con un esquema `<node><name>.../<name></node>` totalmente distinto) — la petición daba HTTP 200 pero no aplicaba los cambios. Ahora el `.content.xml` se interpreta localmente con `fast-xml-parser` (nodo por nodo, con tipos `{Boolean}`/`{Long}`/etc. y arreglos `[a,b,c]` vía `parseDocView`/`parseDocViewValue`) y se reconstruye la subida como una serie de POSTs normales de Sling (uno por nodo, con `jcr:primaryType` y cada propiedad como campos de formulario + `@TypeHint`), vía `pushNodeTree`. Dos comportamientos distintos según el archivo:
  - **Diálogo de edición (`_cq_dialog/.content.xml` — incluye tanto el diálogo de un componente normal como el de "propiedades de página", que usa el mismo mecanismo bajo el componente de página/plantilla)**: reemplazo total. Se borra el nodo completo en el servidor (`:operation=delete`, ignorando 404/410 — nada que borrar la primera vez) y se recrea desde cero con `pushNodeTree`, así que tanto los cambios como los campos eliminados del archivo quedan reflejados en AEM.
  - **Cualquier otro `.content.xml`**: solo se crean/actualizan nodos y propiedades — nunca se borra nada en el servidor. Para avisar si el usuario eliminó algo (sin consultar el servidor AEM en absoluto, por decisión explícita): se compara el árbol actual contra la última versión commiteada en git (`git show HEAD:<ruta>`, vía `detectLocalDeletions`); si esa versión anterior tenía una propiedad o nodo que ya no está, se sincroniza igual lo demás y se avisa que hay que correr una compilación completa para aplicar la eliminación. Si el archivo no está en git todavía, no se avisa nada (no hay con qué comparar).
- **Cualquier otro archivo** (HTML, CSS, JS, imágenes...): se sube como `nt:file` con la técnica estándar de la Sling POST Servlet — campo de formulario `*` (toma el nombre del nodo del archivo subido) + `*@TypeHint=nt:file`, contra el nodo padre.
- Requiere que el nodo padre ya exista en el servidor (pensado para actualizar algo ya instalado antes con una compilación completa, no para crear estructura nueva desde cero).
- **Progreso y cancelación**: barra de progreso con notificación (`vscode.window.withProgress`, cancelable) mientras sincroniza varios archivos; un canal de salida "AEM Toolkit — Sync" registra cada archivo (✔/✘) para revisar errores puntuales sin perder el resto de la sincronización.
- **Credenciales**: host/puerto de Author y Publish son configuración normal (`aemToolkit.sync.*`, con los estándares `4502`/`4503`/`admin` precargados); la(s) contraseña(s) se configuran aparte con **"AEM: Configurar credenciales de sincronización..."** (también disponible en el árbol, bajo "Sincronizar") y se guardan en VS Code Secret Storage, nunca en `settings.json`. Si nunca se configuró una contraseña, se usa `admin` (estándar de una instancia AEM local recién instalada).
- **Dependencia nueva (v1.3.0)**: `fast-xml-parser` (+ `strnum`, su única dependencia) para interpretar el Document View XML — ambas empaquetadas en el `.vsix` (excepción explícita en `.vscodeignore`, que por defecto excluye todo `node_modules/**`).
- Verificado con un servidor Sling simulado (dentro del mismo proceso de Node, sin red real) contra el `.content.xml` real de `eventosgrid/_cq_dialog` del proyecto `italika-v2-cloud`: la secuencia de POSTs generada, el orden padre-antes-que-hijo, y los campos/tipos de cada propiedad se revisaron a mano — pero no se pudo probar contra una instancia AEM real desde este entorno (sin red hacia `localhost` del usuario), así que la primera sincronización de un diálogo real conviene probarla en un componente de prueba antes de confiar en el borrado.

### 3.3 Crear componente (Bloque 17)
- Pregunta: ¿versionado o no? ¿con modelo Sling o sin modelo (solo HTL estático)? Si detecta React en `ui.frontend` (por `package.json`/`webpack.config`), pregunta si se quiere generar también el componente React y ajusta el modelo para exponer sus props (ver 3.8).
- Archivos por defecto: `.html`, `_cq_dialog/.content.xml`, `.content.xml` del componente. Si existe módulo `ui.frontend`: el JS/CSS/SASS/LESS (a elección del usuario) va ahí, en la carpeta del componente dentro de `src/main/webpack` o donde el proyecto los tenga. Si **no** existe `ui.frontend`: se crea una `clientlib` propia del componente con su `css.txt`/`js.txt` y archivos `.css`/`.js`.
- Antes de crear, se puede **configurar** (checkbox recordado en settings) si por defecto se generan los archivos CSS/JS o se pregunta cada vez.

### 3.4 Experience Fragment (Bloque 11)
Pregunta si usar un componente ya existente (selector con buscador sobre todos los componentes del proyecto) o crear uno nuevo para el XF.

### 3.5 Template de página (Bloque 10)
Detecta plantillas existentes en `components/page*` (prefijo `page`: `page`, `pagePrivate`, `pagePublic`…) y ofrece reutilizar una o crear nueva. Pregunta si las propiedades de página son las por defecto o se extienden.

### 3.6 Content Fragment Model (Bloque 5)
Abre un **formulario Webview** para definir atributos (nombre, tipo de dato, requerido, valores permitidos…) con botón "+ agregar atributo" y buscador de tipos. Al terminar, genera el CF Model y muestra un panel de instrucciones con snippets HTL (`data-sly-use`) y Java (`ContentFragment` API) listos para copiar.

### 3.7 Tags (Bloque 3)
Formulario Webview similar (id, título por idioma, tag padre) + panel de instrucciones de uso desde HTL (`cq:tags`) y backend (`ResourceResolver#adaptTo(TagManager.class)`).

### 3.8 Modelo Sling / servlet que consume servicio (Bloque 13)
Genera `Model.java` + interfaz si aplica, y si el usuario indica que consume un servicio, genera también la interfaz + implementación `@Component(service=...)` del servicio y el `@Reference` en el modelo, siguiendo el patrón de gatesconnect-aem/gnp-solvimas/Repsol-Lubricantes (paquetes `services`, anotaciones `@Model`, `@ValueMapValue`/`@ChildResource`, `@PostConstruct`).

### 3.9 Servlet (Bloque 14)
Pregunta método(s) HTTP (`GET/POST/PUT/DELETE/PATCH`, multi-select) y explica brevemente el uso típico de cada uno antes de generar (`@SlingServletPaths`/`@Component` con `sling.servlet.methods`).

### 3.10 Diálogos de componente — el corazón de la extensión (Bloque 19) — 🟡 MVP en v1.4.0
**Comando "AEM: Editar diálogo..."** (clic derecho sobre la carpeta `_cq_dialog` de un componente — o de una página/plantilla, mismo mecanismo `_cq_dialog` — o directamente sobre su `.content.xml`) abre un panel dedicado (`vscode.window.createWebviewPanel`, no una vista de la barra lateral — el formulario con pestañas/agrupadores anidados necesita más espacio horizontal) con el diálogo representado como un árbol visual editable.

**Módulos internos** (`src/dialog/`):
- `fieldCatalog.ts`: catálogo de los 10 tipos disponibles en v1.4.0 — pestaña, agrupador con borde (`granite/ui/components/coral/foundation/form/fieldset`), campo de texto, área de texto, texto enriquecido (RTE), campo numérico, selector de ruta, lista desplegable, casilla, multicampo. El modo "avanzado" con el catálogo completo (radiogroup, switch, colorfield, datepicker, fileupload/imagen, hidden, heading...) queda para una versión siguiente — es un recorte intencional, no un olvido.
- `dialogModel.ts`: convierte entre el árbol JCR real (`DocViewNode` de `sync/docview.ts`, reutilizado tal cual) y un **modelo simplificado** (`DialogTree`: lista de pestañas, cada una con una lista de ítems — campo o agrupador, recursivo). Simplificaciones deliberadas de esta versión:
  - Un diálogo siempre se representa como pestañas; si el original no las usaba (campos directo bajo `content`), se envuelven en una pestaña implícita "General" al abrirlo.
  - Los layouts de columnas (`fixedcolumns`/`column`) se **aplanan** a una sola lista al cargar y **nunca se reintroducen** al guardar — un diálogo con 2 columnas queda en 1 columna después de editarlo con este panel. Es un tradeoff aceptado para no tener que construir también un editor de layout de columnas en esta primera versión.
  - Cualquier campo de un tipo **fuera del top 10** ya presente en el diálogo se conserva como ítem "avanzado": se puede reordenar y eliminar, pero no editar en detalle — y su nodo XML original (incluidos sus propios hijos, ej. opciones anidadas) se preserva verbatim al guardar, para no destruir contenido que la extensión todavía no sabe interpretar del todo.
  - `select`: sus opciones (nodo `items` hijo con `text`/`value`/`selected` por opción) sí tienen editor dedicado (agregar/quitar filas, marcar cuál es la predeterminada).
  - `multifield`: v1.4.0 solo soporta el caso simple — un único campo interno repetible (`composite` con múltiples sub-campos por fila queda para después).
- `docviewSerializer.ts`: **inverso** de `docview.ts#parseDocView` — hasta v1.3.0 la extensión solo sabía leer Document View XML (para sincronizar), nunca escribirlo; este módulo lo serializa de vuelta a texto, con las 4 namespaces estándar, escapando tipos (`{Boolean}`, arreglos `[a,b,c]` con comas escapadas) y caracteres XML.
- `dialogPanel.ts`: arma el HTML del panel. Toda la interacción (agregar/reordenar/editar/eliminar pestañas, agrupadores y campos) ocurre en JS del lado del cliente sobre una copia en memoria del árbol simplificado (igual que el patrón ya usado en `compilePanel.ts`) — la conversión completa a/desde el árbol JCR real solo pasa por el lado de la extensión al abrir el panel y al guardar.

**Guardar**: escribe el `.content.xml` en disco automáticamente (sin un paso de confirmación aparte — así lo pidió el usuario) y, después, pregunta con un modal si se quiere subir el cambio ahora a Author/Publish, reutilizando `syncUris` (que para `_cq_dialog/.content.xml` ya hace el reemplazo total de la v1.3.0) — o dejarlo para más tarde y subirlo manualmente después.

**Pendiente para una versión futura** (no cubierto por el MVP): visibilidad condicional entre campos (`cq-dialog-showhide-target`), extensión de CSS/JS del diálogo vía `clientlib` propio, sincronización automática de propiedades nuevas con el modelo Sling del componente, y el catálogo "avanzado" completo.

**Verificación realizada** (sin acceso a VS Code real ni a una instancia AEM): round-trip completo (`parseDocView` → `fromDocView` → editar el árbol → `toDocView` → `serializeDocView` → volver a parsear) contra el `.content.xml` real de `eventosgrid/_cq_dialog` de `italika-v2-cloud`, verificando que ediciones, reordenamientos, campos nuevos (incluida una opción de `select` con una coma literal) y valores con espacios al inicio sobrevivan intactos. La interacción del panel en sí (clics en agregar/editar/reordenar/eliminar/guardar) se probó cargando el HTML generado en un navegador headless (Playwright) con `acquireVsCodeApi` simulado, confirmando que el mensaje que se manda al guardar es exactamente lo que `dialogModel.ts`/`docviewSerializer.ts` esperan del lado de la extensión.

### 3.11 Editar diálogos + selección múltiple para tabs (Bloque 20)
La edición de **un solo componente** (abrir un diálogo ya existente y modificarlo) queda cubierta por el MVP de 3.10 — es el mismo panel, ya que "editar" y "crear campos nuevos en un diálogo existente" son la misma operación en este editor (agregar/quitar/reordenar sobre el árbol ya cargado).

Sigue pendiente (no cubierto todavía) el flujo de **selección múltiple** para unificar propiedades de varios componentes a la vez:
1. Click derecho sobre **uno o varios** componentes (VS Code permite selección múltiple nativa en el Explorer con Ctrl/Cmd+click o Shift+click; el `menu` `explorer/context` recibe todos los URIs seleccionados si el comando se registra sin filtro de `explorerResourceIsFolder` estricto) → "AEM Toolkit: Agregar propiedades…".
2. Si son **varios componentes seleccionados**: antes de abrir el editor se pregunta la estrategia de unificación:
   - **Pestañas (tabs)**: cada componente pasa a ser una pestaña dentro de un diálogo combinado (útil para un "componente contenedor" que agrupa variantes).
   - **Multifield**: las propiedades comunes se agrupan como un único campo repetible.
   - **Cancelar / tratar cada uno por separado**.

### 3.12 `data-sly-template` en `utils` (Bloque 4)
Formulario simple: nombre de la plantilla + lista de atributos que recibe (`data-sly-template.nombre="${@ attr1, attr2}"`). Se crea en `components/utils` del proyecto (ruta detectada, ej. `apps/gatesconnect/components/utils`).

### 3.13 Modularizar HTML (Bloque 8)
Al seleccionar texto en un `.html`, comando contextual con dos opciones: "Extraer a `data-sly-template`" (reemplaza la selección por `data-sly-call` y crea/agrega la plantilla en `utils` o en el mismo archivo) o "Extraer a archivo aparte" (crea `<nombre>.html` en la misma carpeta y reemplaza la selección por `<sly data-sly-include="<nombre>.html" />`, igual que `orderHistoryList.html` en gatesconnect-aem).

### 3.14 Reusar componente vía `data-sly-resource` (Bloque 9)
Sobre una línea vacía del HTL, `QuickPick` con buscador de todos los `resourceType` existentes en el proyecto. El **id** que el usuario escribe (ej. `btn`) se resuelve automáticamente a algo único: se escanea el archivo (y opcionalmente el resto del proyecto) por otros `data-sly-resource="<id>..."`/`data-sly-list` y se agrega un sufijo incremental (`btn-1`, `btn-2`…) — importante para ciclos `data-sly-list`, donde además se sugiere concatenar el índice de iteración (`btn-${itemList.index}`) en vez de un número fijo, para que no colisione entre iteraciones.

### 3.15 i18n desde texto seleccionado (Bloque 15)
Al seleccionar texto en HTL: pedir el nombre de la key i18n, luego un modal Webview con un campo de texto **por cada idioma detectado** en el proyecto (carpetas `i18n/<idioma>`), prellenando todos con el texto original seleccionado (el usuario solo edita los que quiera traducir). Se crea la entrada en cada diccionario y se reemplaza el texto original por `${'<key>' @ i18n}` (o `data-sly-text` según contexto). Si el cursor ya está sobre una key i18n existente, el mismo comando abre el modal en modo edición con los valores actuales por idioma.

### 3.16 Ir a modelo (Bloque 7)
`DefinitionProvider` de VS Code: al Ctrl/Cmd+click (o "Ir a definición") sobre el valor de `data-sly-use.model="com.foo.Model"`, resuelve la clase Java en `core/src/.../models/` y la abre.

### 3.17 Formatear HTL (Bloque 6)
`DocumentFormattingEditProvider` para `.html` de componentes: al detectar cierre de etiqueta o nueva apertura, aplica salto de línea + indentación (respetando `data-sly-*` como atributos, no como elementos). Mismo mecanismo que el formateador Prettier-based de `angular-schematics-free` (`format.ts`), pero con reglas propias para HTL en vez de Angular templates.

### 3.18 Diagnósticos en vivo (Bloque 21)
`DiagnosticCollection` que revisa el documento en cada cambio (`onDidChangeTextDocument`) buscando etiquetas sin cerrar y errores comunes de sintaxis HTL (`data-sly-*` mal escrito, comillas sin cerrar, `${}` sin cerrar), mostrando el subrayado rojo/amarillo nativo de VS Code (no requiere una extensión de "Error Lens" de terceros — los diagnósticos ya se muestran inline si el usuario tiene Error Lens instalado, y en el editor normal aparecen en el margen y al pasar el mouse).

### 3.19 Editar template de página existente (Bloque 12)
Vista de árbol o Webview para: agregar componentes permitidos a un `policy`/`structure`, editar propiedades de la página, cambiar el HTML base de la plantilla, agregar una clase distintiva al `<body>`/contenedor raíz. Cualquier cambio queda reflejado en los archivos reales, así que aparece automáticamente al compilar/desplegar.

### 3.20 Cache/exclusión de contenido (Bloque 22, opcional)
Si el proyecto trae configuración de dispatcher accesible (ver carpetas `*-dispatcher` junto a `AEM/`), ofrecer editar reglas de cache (`/cache/rules`) o exclusión (`/filter`) desde un formulario simple. Se marca como "si es posible" porque depende de que el dispatcher esté en el mismo workspace.

## 4. Configuración de la extensión (`aemToolkit.*`)

- `aemToolkit.defaultBuildScope`: `all` | `front` | `back` — ámbito por defecto al compilar.
- `aemToolkit.defaultInstallProfile`: perfil Maven usado si no se especifica otro.
- `aemToolkit.defaultSkipTests`: boolean.
- `aemToolkit.mavenExecutable`: `mvn` | `./mvnw` (autodetectado si existe `mvnw`, pero editable).
- `aemToolkit.savedBuildProfiles`: perfiles de compilación guardados por el usuario.
- `aemToolkit.componentsCreateCssJsByDefault`: boolean — si al crear componente se generan CSS/JS sin preguntar.
- `aemToolkit.maxDialogTabs`: número máximo de pestañas al crear un diálogo (default `10`).
- `aemToolkit.defaultLocales`: idiomas por defecto a ofrecer en el modal de i18n (autodetectados de `i18n/*` si no se define).
- `aemToolkit.componentsUtilsPath` / `aemToolkit.i18nPath` / `aemToolkit.namespace`: overrides de rutas si la convención del proyecto no coincide con la detectada automáticamente.
- `aemToolkit.sync.authorHost` / `aemToolkit.sync.authorPort`: host/puerto de la instancia Author usada por "AEM: Subir a Author" (default `localhost`/`4502`).
- `aemToolkit.sync.publishHost` / `aemToolkit.sync.publishPort`: host/puerto de la instancia Publish usada por "AEM: Subir a Publish" (default `localhost`/`4503`).
- `aemToolkit.sync.username`: usuario compartido para ambos destinos (default `admin`). La contraseña no vive acá — se configura con "AEM: Configurar credenciales de sincronización..." y se guarda en Secret Storage.
- `aemToolkit.javaHome`: ruta a la carpeta del JDK que deben usar las Tasks de Maven del panel de compilar. Configuración de **workspace** (`scope: resource`). Vacío (por defecto) = detección automática (ver `jdkSearchFolders`) o el JDK del sistema.
- `aemToolkit.jdkSearchFolders`: hasta 2 carpetas "contenedoras" de varios JDKs donde la extensión busca automáticamente la versión que el proyecto necesita cuando no coincide con la del sistema. Configuración de **workspace**.

## 5. Características adicionales sugeridas (no pedidas explícitamente, para valorar)

- Snippets HTL/Sling Models (`data-sly-use`, `data-sly-list`, anotaciones `@Model` comunes) vía `contributes.snippets`.
- Comando "¿Quién usa este componente?" — busca en todo el proyecto referencias a un `resourceType` dado.
- Explorador de i18n en tabla (todas las keys × todos los idiomas en una vista, editable inline) en vez de ir modal por modal.
- Clonar componente existente con nuevo nombre (duplicar + renombrar en un paso).
- Validación de `_cq_dialog/.content.xml` contra errores comunes de estructura Granite (nodos mal anidados) antes de desplegar.
- Panel de salud del proyecto: versión de AEM/uber-jar detectada, dependencias desactualizadas en `ui.frontend`, perfiles Maven disponibles.
- Integración opcional con Dispatcher (ver 3.20) para previsualizar qué reglas de cache aplican a una página abierta.

---
*Última actualización: Bloque 1 en construcción (cimientos + Compilar proyecto).*
