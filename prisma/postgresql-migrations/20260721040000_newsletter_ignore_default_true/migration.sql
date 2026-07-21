-- Los canales (@newsletter) venían ignorándose siempre en el upstream, así que
-- el default seguro es mantener ese comportamiento: desplegar no debe cambiar
-- nada hasta que se active explícitamente por instancia. Con default false, las
-- instancias existentes empezarían a recibir de golpe todos los canales que
-- siguen, inundando Chatwoot de conversaciones no pedidas.
ALTER TABLE "public"."Setting" ALTER COLUMN "newsletterIgnore" SET DEFAULT true;

UPDATE "public"."Setting" SET "newsletterIgnore" = true;
