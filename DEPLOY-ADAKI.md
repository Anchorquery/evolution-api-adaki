# Despliegue del fork Adaki en producción (evolution.adaki.com)

## Qué se despliega

Fork `Anchorquery/evolution-api-adaki`, basado en **Evolution 2.3.7** — la misma
versión que ya corre en producción. No es una actualización de versión: es un
delta de ~20 archivos sobre la misma base, lo que reduce mucho el riesgo.

Cambios respecto del upstream:

1. **`newsletterIgnore`** — el socket de Baileys ignoraba incondicionalmente todo
   JID `@newsletter`, así que los canales nunca llegaban a Chatwoot. Ahora es un
   setting por instancia, **con default `true` (seguir ignorando)** para que el
   despliegue no cambie el comportamiento de ningún número hasta activarlo a mano.
2. **Endpoints de canales** — `GET /newsletter/find/{instance}` (lista los canales
   seguidos, con nombre real) y `POST /newsletter/follow/{instance}` (resuelve y
   sigue un canal por link de invitación).
3. **`allowedJids`** — whitelist de privacidad en la integración con Chatwoot,
   inversa del `ignoreJids` que ya existía. Vacío = sin cambios de comportamiento.
4. **`createJid`** preserva el sufijo `@newsletter` (antes lo corrompía a `@g.us`
   por longitud, rompiendo el envío saliente a canales).

## Por qué el despliegue es necesario

El picker de audiencias en Chatwoot ya trae **grupos** por nombre, porque usa un
endpoint estándar que producción ya tiene. **Canales viene vacío** por dos razones,
ambas del lado de Evolution: producción ignora los canales a nivel socket, y no
tiene el endpoint `/newsletter/find`. Sin este despliegue, esa parte no funciona.

## Riesgo principal y cómo está mitigado

El riesgo real no es técnico sino de volumen: si los canales dejaran de ignorarse
para las 40 instancias a la vez, cada número que siga canales de noticias, deportes,
etc. empezaría a crear conversaciones en Chatwoot de golpe.

Mitigación: el default es `true` (ignorar), tanto en la columna nueva como en el
código (`loadSettings`/`setSettings`/creación de instancia). Tras el despliegue,
**ninguna instancia cambia de comportamiento**. Los canales se activan uno por uno,
con `POST /settings/set/{instance}` y `newsletterIgnore: false`.

## Migraciones

Dos, ambas aditivas y de metadatos (instantáneas, sin reescritura de tabla):

```sql
-- 20260720195006_add_allowed_jids_and_newsletter_ignore
ALTER TABLE "Chatwoot" ADD COLUMN "allowedJids" JSONB;
ALTER TABLE "Setting"  ADD COLUMN "newsletterIgnore" BOOLEAN NOT NULL DEFAULT false;

-- 20260721040000_newsletter_ignore_default_true
ALTER TABLE "Setting" ALTER COLUMN "newsletterIgnore" SET DEFAULT true;
UPDATE "Setting" SET "newsletterIgnore" = true;
```

No tocan ninguna columna existente ni las tablas de sesión, así que las sesiones de
WhatsApp sobreviven (viven en Postgres/Redis, no en el contenedor).

El contenedor corre `db:deploy` en el arranque, así que las migraciones se aplican
solas. La segunda migración deja el estado correcto aunque la primera haya puesto
`false`: ambas corren en el mismo despliegue.

## Pasos

### 1. Antes de tocar nada

- **Backup de Postgres** de Evolution (`pg_dump`), verificando que el archivo quedó
  con tamaño razonable. Es la red de seguridad real.
- Anotar la imagen/tag que corre hoy, para poder volver atrás.
- Elegir ventana de bajo tráfico: reconectar 40 sesiones genera un pico de CPU y
  de conexiones a Postgres.

### 2. Desplegar

- Apuntar el deploy a `Anchorquery/evolution-api-adaki`, rama `main`.
- Build de la imagen y reinicio de contenedores.
- Si producción está shardeada en 2-3 contenedores (ver
  `estrategia-evolution-api-40-cuentas.md`), desplegar **de a uno**, confirmando que
  las instancias del primero reconectan antes de seguir con el siguiente.

### 3. Verificar que nada se rompió

- Todas las instancias en estado `open`:
  `GET /instance/fetchInstances`
- Un mensaje entrante y uno saliente en un número real llegan a Chatwoot como antes.
- Los grupos siguen llegando igual.

### 4. Activar canales, solo donde haga falta

Para la instancia que interesa (ej. `EAJ - PNV`):

```
POST /settings/set/{instance}   → { "newsletterIgnore": false }
```

Después reconectar esa instancia para que el socket tome el setting, y verificar:

```
GET /newsletter/find/{instance}   → debería listar los canales con nombre
```

Recién ahí el picker de Chatwoot muestra canales.

### 5. Si algo sale mal

Volver a la imagen anterior. Las columnas nuevas quedan en la base pero el código
viejo las ignora, así que no hace falta revertir la migración. Si igual se quisiera:

```sql
ALTER TABLE "Setting"  DROP COLUMN "newsletterIgnore";
ALTER TABLE "Chatwoot" DROP COLUMN "allowedJids";
```

## Pendiente de probar antes de producción

- `POST /newsletter/follow/{instance}` — nunca se ejercitó, falta un link de
  invitación de canal.
- Flujo completo Chatwoot → campaña → canal real. Probado por partes, nunca entero.
