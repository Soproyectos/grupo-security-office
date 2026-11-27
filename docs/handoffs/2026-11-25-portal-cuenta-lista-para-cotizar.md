# Traspaso: indicar si la cuenta del portal puede cotizar

- Estado: integrado
- De: diseño web (cliente) a funcionalidad web

## Qué necesita la pantalla
`GET /api/customer-portal/auth/me` (y el PATCH del perfil) no dicen si la cuenta ACTIVE ya tiene empresa vinculada y asesor. La pantalla debe mostrar «Tu asesor está terminando de configurar tu cuenta» en lugar de las opciones de cotizar.

## Contrato pedido
Agregar a `portalAccountView` un booleano `canQuote`: true solo si state = ACTIVE, hay cliente vinculado y activo, y hay asesor activo (mismas reglas que `createCustomerQuote`).

## Mientras tanto
La interfaz ya lee `account.canQuote`; si no llega (undefined) asume que puede cotizar y muestra el mensaje del servidor (409) al enviar.

## Respuesta (2026-11-26)
`portalAccountView` devuelve `canQuote` (`src/backend/src/modules/customer-portal/portal-profile.ts`, función `canSendQuotes`). Es true solo si la cuenta está ACTIVE, el perfil está completo, hay una empresa vinculada y activa, y hay asesor (el de la cuenta o el de la empresa). Es una pista para la interfaz: el envío de la cotización vuelve a comprobar todo, incluido que el asesor esté activo. Prueba: `portal-profile.spec.ts`.
