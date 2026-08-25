# AEM Toolkit

Extensión de VS Code para acelerar el día a día en proyectos AEM (arquetipo Maven: `core` / `ui.apps` / `ui.content` / `ui.config` / `ui.frontend` opcional / `dispatcher` / `all`).

Ver **FEATURES.md** (en esta misma carpeta) para la especificación completa, el roadmap por bloques (ordenado por complejidad) y el detalle de cada funcionalidad planeada. Ver **CHANGELOG.md** para el detalle de cada cambio, versión por versión.

## Cómo se versiona esta extensión

- **1.0.0** es la primera versión estable. A partir de ella, las mejoras y nuevas funcionalidades se van agregando como versiones **1.x.x**.
- Cuando un conjunto de cambios 1.x.x quede confirmado como estable, se pasa a una nueva versión mayor (**2.0.0**), **sin eliminar ni reescribir** la descripción de 1.0.0 de este README — queda como referencia permanente de lo que esa versión ofrecía.
- Esta sección se amplía con una entrada nueva por cada versión mayor estable (1.0.0, 2.0.0, …), detallando qué hace y en qué se diferencia de la anterior. Para el detalle granular de cada 1.x.x intermedio (mientras se va validando hacia la próxima versión mayor), ver `CHANGELOG.md`.

## Versión 1.0.0 (estable) — Bloque 1: Cimientos + Compilar

Primera versión estable. Cubre por completo el **Bloque 1** del roadmap (`FEATURES.md`): detección de proyecto y todo el ciclo de compilación, con un panel al estilo IntelliJ.

### Detección de proyecto

- Detecta automáticamente el/los proyecto(s) AEM abiertos en el workspace (busca `pom.xml` con `<modules>`): namespace, módulos, si tiene `ui.frontend`, si tiene `mvnw`, y si tiene `jacoco-maven-plugin` configurado.
- Lee los perfiles Maven tanto del `pom.xml` raíz como de los `pom.xml` de los submódulos de primer nivel (ej. el perfil `fedDev`, definido dentro de `ui.frontend/pom.xml` en algunos proyectos de referencia).
- Si hay más de un proyecto AEM abierto a la vez, deja elegir cuál con un selector con buscador.

### Panel "Compilar", anclado en la barra lateral

- Vista propia en la barra de actividad (ícono a la izquierda, junto a Explorador/Extensiones), con dos secciones: "Acciones" (árbol de comandos) y "Compilar" (el panel).
- El panel de compilar vive **dentro de la barra lateral**, no como pestaña de editor — se abre y enfoca con el comando **AEM: Compilar proyecto...**.

#### Modos de compilación

Un select de "Modo" arriba y los perfiles Maven como checkboxes debajo (se pueden marcar varios a la vez, ej. `autoInstallBundle` + `autoInstallPackage` juntos):

1. **Completa** — front + back + tests (de back, y de front si el proyecto tiene script de test). Es el modo que carga por defecto al abrir el panel.
2. **Solo Front** — corre `aemToolkit.frontBuildCommand` (por defecto `npm run dev`, sin minificar, para que sea fácil de debuggear). Opción de saltar tests de front si el proyecto tiene script de test.
3. **Solo Back** — con tests incluidos por defecto (opción de saltarlos con `-DskipTests`).
4. **Test-coverage Frontend** — solo disponible si el proyecto tiene un script de coverage en `ui.frontend/package.json`; lo corre y muestra el reporte.
5. **Test-coverage Backend** — usa `git status` para saber si hubo cambios en el back desde el último commit: si los hay, compila todo el back y corre tests; si no, solo re-corre los tests. Si falta `jacoco-maven-plugin`, ofrece agregarlo automáticamente (perfil `coverage` en el pom raíz). Al terminar, muestra un panel con el % de coverage por clase, con buscador y filtro por porcentaje.
6. Se puede **guardar el estado del panel como un modo personalizado con nombre** (perfiles, skip tests, destino, argumentos extra) y reutilizarlo después desde el mismo select, o eliminarlo con el ícono 🗑.

Al elegir un modo (o al cargar el panel con el modo por defecto "Completa"), **los perfiles marcados, los checks de saltar tests y los argumentos extra se resetean a los valores por defecto de ese modo** — nunca queda algo "pegado" de un modo elegido antes. Los modos personalizados guardados sí siguen cargando exactamente lo que se guardó en su momento.

#### Destino Author / Publish

Para los modos que instalan en una instancia, se puede elegir destino **Author** (puerto `4502`) / **Publish** (puerto `4503`) / **No aplica**, con host/puerto precargados con esos estándares. Si existe un perfil hermano `<perfil>Publish` (convención vista en los proyectos de referencia, ej. `autoInstallPackage` → `autoInstallPackagePublish`), se usa automáticamente; si no existe, se sobrescriben `-Daem.host`/`-Daem.port` como mejor esfuerzo.

#### Acciones rápidas (estilo ventana "Maven" de IntelliJ)

Fila de íconos arriba del select de Modo, para operaciones puntuales de Maven que usan los perfiles marcados en ese momento en "Perfiles Maven" (no dependen del Modo elegido):

- ▶ **Compilar** — reactor completo (incluye `ui.frontend`), con tests.
- ⚡ **Compilar sin tests** — reactor completo, saltando los tests tanto de back como de front.
- 📥 **Descargar dependencias** (`mvn dependency:resolve`).
- 🗂️ **Generar sources y actualizar carpetas** (`mvn generate-sources`).
- 🧹 **Limpiar** (`mvn clean`).
- 🌳 **Ver árbol de dependencias** (`mvn dependency:tree`).
- 🔍 **Analizar dependencias** — declaradas sin usar / usadas sin declarar (`mvn dependency:analyze`).

Descargar dependencias, generar sources, limpiar, árbol y análisis de dependencias excluyen `ui.frontend` del reactor (`-pl !ui.frontend -am`, igual que "Solo Back"); ▶ y ⚡ sí lo incluyen a propósito.

#### Detener una compilación en curso

Mientras hay una Task corriendo (lanzada desde cualquier botón del panel, o desde el "▶ Compilar" del wizard de Modo), el ícono ▶ se convierte en un **recuadro rojo ⏹** que la detiene al pulsarlo (`TaskExecution.terminate()`), y el resto de los botones se deshabilitan mientras tanto para no lanzar dos compilaciones en paralelo sobre el mismo reactor. Al terminar — bien, con error, o detenida manualmente — todo vuelve a su estado normal, y si fue detenida a mano se avisa explícitamente ("⏹ ... detenida por el usuario.") en vez de mostrarlo como un error con código `undefined`.

### Ejecución

Todo corre como **VS Code Tasks** (no `sendText` a una terminal) — se sigue viendo el output real en un panel de terminal, pero permite encadenar pasos (ej. build → tests) y conocer el código de salida real antes de continuar (ej. antes de leer un reporte de coverage).

### Comandos

- **AEM: Compilar proyecto...**
- **AEM: Repetir última compilación**
- **AEM: Mostrar información del proyecto detectado**
- **AEM: Actualizar detección de proyecto**

### Configuración (`aemToolkit.*`)

- `mavenExecutable` — `auto` / `mvn` / `mvnw`.
- `frontBuildCommand` — comando para "Solo Front" (por defecto `npm run dev`, sin minificar).
- `compilePresets` — modos personalizados guardados (se administran desde el propio panel).
- `componentsCreateCssJsByDefault`, `maxDialogTabs`, `defaultLocales`, `namespace`, `componentsUtilsPath` — ya configurables, preparados para los próximos bloques (creación de componentes/diálogos/i18n) que todavía no están implementados.

## Desarrollo

```bash
npm install
npm run compile   # o: npm run watch
```

Luego F5 en VS Code (`Run Extension`) para abrir una ventana de prueba con la extensión cargada, apuntando a una carpeta que contenga uno de los proyectos AEM de referencia.

Empaquetar (`.vsix`):

```bash
npm run package
```
