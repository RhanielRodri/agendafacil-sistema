ALTER TABLE "Service"
ADD COLUMN "demoId" TEXT NOT NULL DEFAULT 'studio-cut';

ALTER TABLE "Professional"
ADD COLUMN "demoId" TEXT NOT NULL DEFAULT 'studio-cut';

CREATE UNIQUE INDEX "Service_demoId_name_key" ON "Service"("demoId", "name");
CREATE INDEX "Service_demoId_active_idx" ON "Service"("demoId", "active");
CREATE UNIQUE INDEX "Professional_demoId_name_key" ON "Professional"("demoId", "name");
CREATE INDEX "Professional_demoId_active_idx" ON "Professional"("demoId", "active");

INSERT INTO "Service" ("demoId", "name", "description", "duration", "price", "active", "updatedAt") VALUES
  ('lumiere', 'Limpeza de pele', 'Limpeza profunda com extração, esfoliação e hidratação.', 60, 180, true, CURRENT_TIMESTAMP),
  ('lumiere', 'Harmonização facial', 'Procedimento personalizado para realçar os traços com naturalidade.', 90, 1200, true, CURRENT_TIMESTAMP),
  ('lumiere', 'Drenagem linfática', 'Massagem corporal para reduzir inchaço e melhorar a circulação.', 60, 150, true, CURRENT_TIMESTAMP);

INSERT INTO "Professional" ("demoId", "name", "specialty", "photo", "active", "updatedAt") VALUES
  ('lumiere', 'Beatriz Moura', 'Skincare e procedimentos faciais', 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=800&q=80', true, CURRENT_TIMESTAMP),
  ('lumiere', 'Camila Lins', 'Harmonização facial e bioestimuladores', 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=800&q=80', true, CURRENT_TIMESTAMP),
  ('lumiere', 'Fernanda Costa', 'Terapia corporal e drenagem', 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&w=800&q=80', true, CURRENT_TIMESTAMP);
