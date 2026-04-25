# Decisiones técnicas – autenticación mínima Mercado Libre

## Decisión 1
Antes de simular costos o publicar en ML se resuelve una capa mínima de autenticación OAuth.

## Decisión 2
En la primera versión se trabaja con una sola cuenta ML conectada para toda la app.

## Decisión 3
La app guarda:
- access_token
- refresh_token
- expires_at
- user_id
- nickname

## Decisión 4
La renovación automática del token queda para el siguiente bloque.\n