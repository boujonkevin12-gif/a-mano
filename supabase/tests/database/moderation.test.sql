begin;
create extension if not exists pgtap with schema extensions;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('50000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'am-admin@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Admin de prueba"}', now(), now()),
  ('50000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'am-nonadmin@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Usuario de prueba"}', now(), now()),
  ('50000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'am-owner-pending@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Dueño pendiente"}', now(), now()),
  ('50000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'am-owner-approved@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Dueño aprobado"}', now(), now()),
  ('50000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'am-owner-rejected@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Dueño rechazado"}', now(), now())
on conflict (id) do nothing;

insert into public.professionals (
  id, user_id, slug, business_name, description, city, service_area, status, is_published
) values
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'moderacion-pendiente-50000000-0000-4000-8000-000000000003', 'Perfil para aprobar', 'Servicio de prueba con una descripción suficiente para moderación.', 'Ciudad de prueba', 'Centro', 'pending', false),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'moderacion-aprobado-50000000-0000-4000-8000-000000000004', 'Perfil publicado de prueba', 'Servicio aprobado de prueba con una descripción suficiente.', 'Ciudad de prueba', 'Toda la ciudad', 'approved', true),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000005', 'moderacion-rechazado-50000000-0000-4000-8000-000000000005', 'Perfil para rechazar', 'Servicio de prueba que será rechazado con un motivo.', 'Ciudad de prueba', 'Zona norte', 'pending', false);

insert into public.professional_categories (professional_id, category_id)
select p.id, c.id
from public.professionals p
cross join public.categories c
where p.id in (
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000003'
) and c.slug = 'hogar-construccion';

select plan(32);

select private.manage_admin_role('50000000-0000-4000-8000-000000000001', true);
select pass('La sesión confiable de base de datos otorga el rol inicial antes de probarlo');
select throws_ok('select private.manage_admin_role(''50000000-0000-4000-8000-000000000001'', false)', '55000', null, 'El procedimiento evita revocar al último administrador');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select public.is_current_user_admin()', '42501', null, 'Anon no puede consultar la pertenencia administrativa');
select throws_ok('select * from public.get_admin_professionals(''pending'', 24, 0)', '42501', null, 'Anon no puede leer la cola administrativa');
select throws_ok('select * from public.moderate_professional(''60000000-0000-4000-8000-000000000001'', ''approve'', null, ''pending'', false)', '42501', null, 'Anon no puede aprobar perfiles mediante el RPC');
select throws_ok('select * from private.admin_users', '42501', null, 'Anon no puede consultar la tabla de roles');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.is_current_user_admin(), false, 'Un usuario común no obtiene el rol administrativo');
select throws_ok('select * from public.get_admin_professionals(''pending'', 24, 0)', '42501', null, 'Un usuario común no puede leer perfiles pendientes');
select throws_ok('select * from public.moderate_professional(''60000000-0000-4000-8000-000000000001'', ''approve'', null, ''pending'', false)', '42501', null, 'Un usuario común no puede modificar moderación');
select throws_ok('select private.manage_admin_role(''50000000-0000-4000-8000-000000000002'', true)', '42501', null, 'Un usuario común no puede autoasignarse como administrador');
select throws_ok('select * from private.professional_moderation_events', '42501', null, 'Un usuario común no puede consultar la auditoría');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.is_current_user_admin(), true, 'El usuario otorgado por bootstrap reconoce su rol');
select throws_ok('select * from private.admin_users', '42501', null, 'Incluso el administrador no lee directamente la tabla de roles desde la API');
select throws_ok('select user_id from public.professionals', '42501', null, 'El RPC administrativo no amplía los grants directos de profesionales');
select is((select count(*)::integer from public.profiles where id = '50000000-0000-4000-8000-000000000003'), 0, 'Ser administrador no permite leer los datos personales de los profesionales');
select is((select count(*)::integer from public.get_admin_professionals('pending', 24, 0)), 2, 'El administrador recibe solicitudes pendientes mediante el RPC autorizado');

select is((select status from public.moderate_professional('60000000-0000-4000-8000-000000000001', 'approve', null, 'pending', false)), 'approved', 'Aprobar publica una solicitud pendiente');
select is((select count(*)::integer from public.public_professionals where id = '60000000-0000-4000-8000-000000000001'), 1, 'Un perfil aprobado se vuelve visible públicamente');
select is((select status from public.moderate_professional('60000000-0000-4000-8000-000000000003', 'reject', 'Falta describir el alcance del trabajo.', 'pending', false)), 'rejected', 'Rechazar guarda el estado y requiere motivo');
select is((select count(*)::integer from public.public_professionals where id = '60000000-0000-4000-8000-000000000003'), 0, 'Un perfil rechazado permanece privado');
select is((select last_moderation_reason from public.get_admin_professionals('rejected', 24, 0) where id = '60000000-0000-4000-8000-000000000003'), 'Falta describir el alcance del trabajo.', 'La cola muestra el último motivo de rechazo');

select is((select is_published from public.moderate_professional('60000000-0000-4000-8000-000000000002', 'hide', 'El profesional pidió pausar la publicación.', 'approved', true)), false, 'Ocultar conserva aprobación pero quita publicación');
select is((select count(*)::integer from public.public_professionals where id = '60000000-0000-4000-8000-000000000002'), 0, 'Un perfil oculto deja de ser visible públicamente');
select is((select is_published from public.moderate_professional('60000000-0000-4000-8000-000000000002', 'publish', null, 'approved', false)), true, 'Un administrador puede volver a publicar un perfil aprobado');
select is((select status from public.moderate_professional('60000000-0000-4000-8000-000000000002', 'suspend', 'Se requiere verificar una actualización reportada.', 'approved', true)), 'suspended', 'Suspender cambia el estado y quita la publicación');
select is((select count(*)::integer from public.public_professionals where id = '60000000-0000-4000-8000-000000000002'), 0, 'Un perfil suspendido no queda expuesto públicamente');
select is((select status from public.moderate_professional('60000000-0000-4000-8000-000000000002', 'restore', 'Se revisó el caso y puede volver a publicarse.', 'suspended', false)), 'approved', 'Restablecer reactiva de forma explícita el perfil suspendido');

select throws_ok('select * from public.moderate_professional(''60000000-0000-4000-8000-000000000002'', ''reject'', ''No corresponde.'', ''approved'', true)', '55000', null, 'No se puede rechazar desde un estado aprobado');
select throws_ok('select * from public.moderate_professional(''60000000-0000-4000-8000-000000000001'', ''approve'', null, ''pending'', false)', '40001', null, 'Una acción repetida con estado antiguo falla por concurrencia');
select throws_ok('select * from public.moderate_professional(''60000000-0000-4000-8000-000000000002'', ''hide'', null, ''approved'', true)', '22023', null, 'La acción hide requiere motivo incluso si se llama directamente al RPC');
select throws_ok('select * from private.professional_moderation_events', '42501', null, 'El administrador consulta la auditoría por el RPC y no por acceso directo');
reset role;
select is((select count(*)::integer from private.professional_moderation_events), 6, 'Cada transición válida queda registrada en la auditoría');

select * from finish();
rollback;
