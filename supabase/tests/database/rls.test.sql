begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'am-rtest1@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Cuenta de prueba 1"}', now(), now()),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'am-rtest2@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Cuenta de prueba 2"}', now(), now())
on conflict (id) do nothing;

insert into public.professionals (
  id, user_id, slug, business_name, description, city, service_area, status, is_published
) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'servicio-aprobado-30000000-0000-4000-8000-000000000001', 'Servicio aprobado', 'Descripción de prueba con información suficiente para publicar.', 'Concepción del Uruguay', 'Centro', 'approved', true),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'servicio-pendiente-30000000-0000-4000-8000-000000000002', 'Servicio pendiente', 'Descripción de prueba que todavía no se comparte públicamente.', 'Concepción del Uruguay', 'Centro', 'pending', false);

insert into public.professional_categories (professional_id, category_id)
select '40000000-0000-4000-8000-000000000001', id from public.categories where slug = 'hogar-construccion';

select plan(18);

select is((select display_name from public.profiles where id = '30000000-0000-4000-8000-000000000001'), 'Cuenta de prueba 1', 'El trigger crea el perfil básico al registrarse');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::integer from public.public_professionals where id = '40000000-0000-4000-8000-000000000001'), 1, 'Los visitantes reciben el perfil aprobado y publicado del fixture');
select is((select count(*)::integer from public.search_public_professionals(null, 'Concepción del Uruguay', null) where id = '40000000-0000-4000-8000-000000000001'), 1, 'La búsqueda pública incluye el fixture aprobado y excluye su perfil pendiente');
select is((select count(*)::integer from public.search_public_professionals_page(null, 'Concepción del Uruguay', null, 12, 0, 'name') where id = '40000000-0000-4000-8000-000000000001'), 1, 'La búsqueda paginada incluye el fixture público aprobado');
select is((select count(*)::integer from public.search_public_professionals_page(null, 'Concepción del Uruguay', null, 12, 0, 'name') where has_more), 0, 'La paginación solo indica otra página cuando existen más resultados');
select is((select count(*)::integer from public.search_public_professionals_page('aprobado', null, null, 12, 0, 'name')), 1, 'La palabra clave busca el nombre y la descripción sin mostrar pendientes');
select is((select count(*)::integer from public.search_public_professionals_page(null, 'Concepción del Uruguay', 'hogar-construccion', 12, 0, 'name') where id = '40000000-0000-4000-8000-000000000001'), 1, 'La paginación combina categoría y ciudad para el fixture');
select throws_ok('select * from public.profiles', '42501', null, 'Los visitantes no pueden leer perfiles personales');
select throws_ok('select user_id from public.professionals', '42501', null, 'Los visitantes no pueden leer la tabla privada ni el user_id');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select display_name from public.profiles where id = '30000000-0000-4000-8000-000000000001'), 'Cuenta de prueba 1', 'Cada usuario puede leer su perfil');
select is((select count(*)::integer from public.profiles where id = '30000000-0000-4000-8000-000000000002'), 0, 'Un usuario no puede leer el perfil privado de otra persona');
select lives_ok($$update public.profiles set display_name = 'Cambio ajeno' where id = '30000000-0000-4000-8000-000000000002'$$, 'La tentativa de actualizar el perfil ajeno no genera una excepción SQL');
select is((select status from public.get_own_professional_profile() limit 1), 'approved', 'El RPC de cuenta solo consulta el perfil profesional del usuario autenticado');
select throws_ok('update public.professionals set status = ''approved'', is_published = true where user_id = ''30000000-0000-4000-8000-000000000001''', '42501', null, 'El cliente no puede asignarse aprobación ni publicación');
select isnt(public.submit_own_professional_profile(
  'nuevo-servicio-30000000-0000-4000-8000-000000000001',
  'Nuevo servicio', 'Descripción suficientemente extensa para el perfil de prueba.', null,
  'Concepción del Uruguay', 'Toda la ciudad', array['tecnologia']
), null::uuid, 'El perfil profesional puede enviarse mediante el RPC autorizado');

reset role;
select is((select status from public.professionals where user_id = '30000000-0000-4000-8000-000000000001'), 'pending', 'Guardar una edición revoca la publicación y vuelve a revisión');
select is((select display_name from public.profiles where id = '30000000-0000-4000-8000-000000000002'), 'Cuenta de prueba 2', 'RLS impide que la tentativa de edición cruzada cambie el perfil ajeno');
select is((select status from public.professionals where user_id = '30000000-0000-4000-8000-000000000002'), 'pending', 'Guardar el perfil propio no modifica el perfil profesional ajeno');

select * from finish();
rollback;
