INSERT INTO tenants (id, slug, name, active, created_at, updated_at) VALUES
  ('tenant-studio-cut', 'studio-cut', 'Studio Cut', 1, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z'),
  ('tenant-lumiere', 'lumiere', 'Lumière Estética', 1, '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z')
ON CONFLICT(slug) DO UPDATE SET name = excluded.name, active = excluded.active, updated_at = excluded.updated_at;

INSERT INTO services (id, tenant_id, name, description, duration_minutes, price_cents, active, display_order, requires_evaluation) VALUES
  ('service-studio-cut', 'studio-cut', 'Corte masculino', 'Corte completo com acabamento.', 30, 4500, 1, 0, 0),
  ('service-studio-beard', 'studio-cut', 'Barba completa', 'Desenho e finalização de barba.', 30, 3500, 1, 1, 0),
  ('service-studio-combo', 'studio-cut', 'Corte + barba', 'Cuidado completo para cabelo e barba.', 60, 7500, 1, 2, 0),
  ('service-lumiere-skin', 'lumiere', 'Limpeza de pele', 'Cuidado facial com limpeza e hidratação.', 60, 18000, 1, 0, 0),
  ('service-lumiere-evaluation', 'lumiere', 'Harmonização facial', 'Procedimento com avaliação prévia.', 90, 120000, 1, 1, 1),
  ('service-lumiere-drainage', 'lumiere', 'Drenagem linfática', 'Cuidado corporal e drenagem.', 60, 15000, 1, 2, 0)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  duration_minutes = excluded.duration_minutes,
  price_cents = excluded.price_cents,
  active = excluded.active,
  display_order = excluded.display_order,
  requires_evaluation = excluded.requires_evaluation,
  updated_at = '2026-07-21T00:00:00.000Z';

INSERT INTO professionals (id, tenant_id, name, specialty, photo, active, display_order) VALUES
  ('professional-studio-1', 'studio-cut', 'Barbeiro Studio 1', 'Cortes clássicos', '/assets/professionals/studio-1.webp', 1, 0),
  ('professional-studio-2', 'studio-cut', 'Barbeiro Studio 2', 'Barba e degradê', '/assets/professionals/studio-2.webp', 1, 1),
  ('professional-lumiere-1', 'lumiere', 'Especialista Lumière 1', 'Cuidados faciais', '/assets/professionals/lumiere-1.webp', 1, 0),
  ('professional-lumiere-2', 'lumiere', 'Especialista Lumière 2', 'Procedimentos e avaliação', '/assets/professionals/lumiere-2.webp', 1, 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  specialty = excluded.specialty,
  photo = excluded.photo,
  active = excluded.active,
  display_order = excluded.display_order,
  updated_at = '2026-07-21T00:00:00.000Z';

INSERT INTO professional_services (tenant_id, professional_id, service_id) VALUES
  ('studio-cut', 'professional-studio-1', 'service-studio-cut'),
  ('studio-cut', 'professional-studio-1', 'service-studio-combo'),
  ('studio-cut', 'professional-studio-2', 'service-studio-beard'),
  ('studio-cut', 'professional-studio-2', 'service-studio-combo'),
  ('lumiere', 'professional-lumiere-1', 'service-lumiere-skin'),
  ('lumiere', 'professional-lumiere-1', 'service-lumiere-drainage'),
  ('lumiere', 'professional-lumiere-2', 'service-lumiere-evaluation')
ON CONFLICT(tenant_id, professional_id, service_id) DO NOTHING;

INSERT INTO tenant_settings (
  id, tenant_id, public_name, timezone, slot_duration_minutes,
  min_advance_minutes, max_future_days, cancellation_policy,
  confirmation_message, booking_enabled
) VALUES
  ('settings-studio-cut', 'studio-cut', 'Studio Cut', 'America/Sao_Paulo', 30, 60, 60, 'Cancelamentos respeitam a antecedência informada.', 'Chegue alguns minutos antes do horário.', 1),
  ('settings-lumiere', 'lumiere', 'Lumière Estética', 'America/Sao_Paulo', 30, 180, 90, 'Reagendamentos respeitam a antecedência informada.', 'Procedimentos podem exigir avaliação prévia.', 1)
ON CONFLICT(tenant_id) DO UPDATE SET
  public_name = excluded.public_name,
  timezone = excluded.timezone,
  slot_duration_minutes = excluded.slot_duration_minutes,
  min_advance_minutes = excluded.min_advance_minutes,
  max_future_days = excluded.max_future_days,
  cancellation_policy = excluded.cancellation_policy,
  confirmation_message = excluded.confirmation_message,
  booking_enabled = excluded.booking_enabled,
  updated_at = '2026-07-21T00:00:00.000Z';

INSERT INTO business_hours (id, tenant_id, day_of_week, open_time, close_time, is_open) VALUES
  ('hours-studio-0', 'studio-cut', 0, '00:00', '00:00', 0),
  ('hours-studio-1', 'studio-cut', 1, '09:00', '18:00', 1),
  ('hours-studio-2', 'studio-cut', 2, '09:00', '18:00', 1),
  ('hours-studio-3', 'studio-cut', 3, '09:00', '18:00', 1),
  ('hours-studio-4', 'studio-cut', 4, '09:00', '18:00', 1),
  ('hours-studio-5', 'studio-cut', 5, '09:00', '18:00', 1),
  ('hours-studio-6', 'studio-cut', 6, '08:00', '14:00', 1),
  ('hours-lumiere-0', 'lumiere', 0, '00:00', '00:00', 0),
  ('hours-lumiere-1', 'lumiere', 1, '00:00', '00:00', 0),
  ('hours-lumiere-2', 'lumiere', 2, '10:00', '19:00', 1),
  ('hours-lumiere-3', 'lumiere', 3, '10:00', '19:00', 1),
  ('hours-lumiere-4', 'lumiere', 4, '10:00', '19:00', 1),
  ('hours-lumiere-5', 'lumiere', 5, '10:00', '19:00', 1),
  ('hours-lumiere-6', 'lumiere', 6, '10:00', '16:00', 1)
ON CONFLICT(tenant_id, day_of_week) DO UPDATE SET
  open_time = excluded.open_time,
  close_time = excluded.close_time,
  is_open = excluded.is_open;

INSERT INTO professional_schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, active) VALUES
  ('schedule-studio-1-mon-am', 'studio-cut', 'professional-studio-1', 1, '09:00', '12:00', 1),
  ('schedule-studio-1-mon-pm', 'studio-cut', 'professional-studio-1', 1, '13:00', '17:00', 1),
  ('schedule-studio-1-tue', 'studio-cut', 'professional-studio-1', 2, '09:00', '18:00', 1),
  ('schedule-studio-2-mon', 'studio-cut', 'professional-studio-2', 1, '09:00', '18:00', 1),
  ('schedule-lumiere-1-tue', 'lumiere', 'professional-lumiere-1', 2, '10:00', '19:00', 1),
  ('schedule-lumiere-1-thu-am', 'lumiere', 'professional-lumiere-1', 4, '11:00', '14:00', 1),
  ('schedule-lumiere-1-thu-pm', 'lumiere', 'professional-lumiere-1', 4, '15:00', '19:00', 1),
  ('schedule-lumiere-2-tue', 'lumiere', 'professional-lumiere-2', 2, '10:00', '19:00', 1)
ON CONFLICT(id) DO UPDATE SET
  day_of_week = excluded.day_of_week,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  active = excluded.active,
  updated_at = '2026-07-21T00:00:00.000Z';

INSERT INTO schedule_blocks (id, tenant_id, professional_id, date, all_day, start_time, end_time, reason) VALUES
  ('block-studio-partial', 'studio-cut', NULL, '2099-01-15', 0, '12:00', '13:00', 'Pausa geral de demonstração'),
  ('block-studio-professional', 'studio-cut', 'professional-studio-1', '2099-01-15', 0, '15:00', '16:00', 'Bloqueio individual de demonstração'),
  ('block-lumiere-full', 'lumiere', NULL, '2099-01-16', 1, NULL, NULL, 'Bloqueio integral de demonstração')
ON CONFLICT(id) DO UPDATE SET
  professional_id = excluded.professional_id,
  date = excluded.date,
  all_day = excluded.all_day,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  reason = excluded.reason,
  updated_at = '2026-07-21T00:00:00.000Z';
