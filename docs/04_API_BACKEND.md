# API backend – autenticación mínima Mercado Libre

## Endpoints
- `GET /api/ml/auth/start`
- `GET /api/ml/auth/callback`
- `GET /api/ml/auth/status`
- `POST /api/ml/auth/disconnect`

## Variables de entorno
- `MELI_APP_ID`
- `MELI_CLIENT_SECRET`
- `MELI_REDIRECT_URI`
- `MELI_USE_PKCE` (opcional)

## Objetivo
Resolver una autenticación mínima OAuth antes de:
- simulación ML
- publicación real
- consulta de costos de venta y envío\n