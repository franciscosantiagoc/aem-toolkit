# Changelog — v2.0.0.x (versión mayor estable actual)

> Detalle de cada cambio dentro de la serie 2.0.0.x. Cuando esta serie se dé por estable y se pase a la próxima versión mayor, este archivo queda congelado tal cual (igual que `CHANGELOG-1.0.0.md`) y se crea `CHANGELOG-3.0.0.md` para lo que siga. Ver `CHANGELOG.md` para el índice de todos los archivos.

## 2.0.0 — Segunda versión mayor estable

- **Sin cambios de código sobre la v1.8.1** — esta versión marca como **estable** todo lo construido en la serie 1.1.0 → 1.8.1: sincronización sin compilar (Bloque 2, con el fix real de `.content.xml` de v1.3.0), detección automática del JDK del proyecto, y el editor visual de diálogos completo (Bloque 19/20 MVP: catálogo de 20 tipos de campo, pestañas opcionales, multicampo corregido, XML reformateado, comando "AEM: Diálogo" de acceso rápido, botón "Copiar cómo usarlo", todo agrupado en un solo submenú "AEM Toolkit").
- **`README.md` ampliado** con una nueva sección "Versión 2.0.0 (estable)" que documenta todo lo anterior en un solo lugar, sin borrar ni reescribir la sección de la v1.0.0 — queda como referencia permanente, igual que se hizo al pasar de 0.x a 1.0.0.
- **`FEATURES.md` reordenado**: el roadmap por bloques (sección 1) pasa de estar ordenado por complejidad a estar ordenado por **prioridad de construcción** — el Bloque 17 (crear componente, con su clientlib de estilos/JS consciente de si `ui.frontend` está activo) y el 18 (generar componente React/Angular) suben al frente como próximos a construir, justo después de los diálogos (Bloque 19/20, con MVP ya armado); el resto queda en su orden original de complejidad. Los números de Bloque no cambiaron (son los mismos que referencian los títulos de la sección 3).
- **`CHANGELOG.md` dividido por versión mayor**, a pedido explícito, para que no crezca sin límite: el detalle de 0.1.0 a 1.8.1 pasó a `CHANGELOG-1.0.0.md`; esta serie 2.0.0.x vive en este archivo; `CHANGELOG.md` queda como índice corto entre ambos.
