-- Sincroniza o dataset publico com a demo Studio Cut aprovada.
-- Idempotente: upsert por id, roda igual em local e producao.

INSERT INTO "Service" ("id","name","description","duration","price","active","updatedAt") VALUES
  (1,'Corte masculino','Corte completo com acabamento na navalha.',30,45,true,CURRENT_TIMESTAMP),
  (2,'Barba completa','Toalha quente, desenho e finalização.',30,35,true,CURRENT_TIMESTAMP),
  (3,'Corte + barba','Combo completo para cabelo e barba.',60,75,true,CURRENT_TIMESTAMP),
  (4,'Sobrancelha','Design rápido com acabamento natural.',30,20,true,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name"=EXCLUDED."name",
  "description"=EXCLUDED."description",
  "duration"=EXCLUDED."duration",
  "price"=EXCLUDED."price",
  "active"=true;

INSERT INTO "Professional" ("id","name","specialty","photo","active","updatedAt") VALUES
  (1,'Bruno Alves','Corte moderno','https://images.unsplash.com/photo-1582893561942-d61adcb2e534?auto=format&fit=crop&w=800&q=80',true,CURRENT_TIMESTAMP),
  (2,'Lucas Martins','Cortes clássicos','https://images.unsplash.com/photo-1605980776566-0486c3ac7617?auto=format&fit=crop&w=800&q=80',true,CURRENT_TIMESTAMP),
  (3,'Rafael Costa','Barba e degradê','https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80',true,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "name"=EXCLUDED."name",
  "specialty"=EXCLUDED."specialty",
  "photo"=EXCLUDED."photo",
  "active"=true;

SELECT setval(pg_get_serial_sequence('"Service"','id'), GREATEST((SELECT MAX("id") FROM "Service"), 1));
SELECT setval(pg_get_serial_sequence('"Professional"','id'), GREATEST((SELECT MAX("id") FROM "Professional"), 1));
