-- Corrige as fotos dos profissionais: URLs antigas estavam quebradas (404)
-- ou apontavam para imagens erradas (ferramentas em vez de retrato).
UPDATE "Professional" SET "photo" = 'https://images.unsplash.com/photo-1605980776566-0486c3ac7617?auto=format&fit=crop&w=800&q=80' WHERE "name" = 'Lucas Martins';
UPDATE "Professional" SET "photo" = 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80' WHERE "name" = 'Rafael Costa';
UPDATE "Professional" SET "photo" = 'https://images.unsplash.com/photo-1582893561942-d61adcb2e534?auto=format&fit=crop&w=800&q=80' WHERE "name" = 'Bruno Alves';
