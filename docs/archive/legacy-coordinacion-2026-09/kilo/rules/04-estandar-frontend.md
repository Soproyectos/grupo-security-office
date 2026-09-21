---
title: Estándares frontend
---
# 5. Estándares frontend

Para el agente frontend, fijar obligatoriamente:

- **React + TypeScript + Tailwind CSS.**
- **Diseño mobile-first.**
- **Componentes semánticos y reutilizables.**
- **Accesibilidad WCAG AA:** `label` asociado a controles, foco visible, navegación por teclado, textos alternativos, contraste adecuado, botones con nombre accesible y estados de carga/error.
- No introducir CSS inline, excepto si ya es el patrón visible en los archivos expresamente abiertos.
- No tocar `index.css`, `tailwind.config.js`, Vite, ESLint ni TypeScript config sin autorización explícita.