begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('70000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'storage-owner@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('70000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'storage-pending@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('70000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'storage-admin@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into public.professionals (id, user_id, slug, business_name, description, city, service_area, status, is_published) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'storage-public-fixture', 'Perfil aprobado de prueba', 'Descripción de prueba aprobada y publicada.', 'Ciudad de prueba', 'Centro', 'approved', true),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'storage-pending-fixture', 'Perfil pendiente de prueba', 'Descripción de prueba pendiente.', 'Ciudad de prueba', 'Centro', 'pending', false),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', 'storage-suspended-fixture', 'Perfil suspendido de prueba', 'Descripción de prueba suspendida.', 'Ciudad de prueba', 'Centro', 'suspended', false);

insert into private.admin_users(user_id) values ('70000000-0000-4000-8000-000000000003');
insert into private.professional_images (id, professional_id, object_path, upload_path, image_kind, mime_type, extension, size_bytes, width, height, state) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'professionals/71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001.jpg', null, 'profile', 'image/jpeg', 'jpg', 100, 10, 10, 'ready'),
  ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'professionals/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000002.jpg', null, 'profile', 'image/jpeg', 'jpg', 100, 10, 10, 'ready'),
  ('72000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', 'professionals/71000000-0000-4000-8000-000000000003/72000000-0000-4000-8000-000000000003.jpg', null, 'profile', 'image/jpeg', 'jpg', 100, 10, 10, 'ready'),
  ('72000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000002', 'professionals/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg', 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg', 'portfolio', 'image/jpeg', 'jpg', 100, 10, 10, 'uploading');
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('amano-professional-images', 'professionals/71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000001.jpg', '70000000-0000-4000-8000-000000000001', '{"mimetype":"image/jpeg","size":100}'),
  ('amano-professional-images', 'professionals/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000002.jpg', '70000000-0000-4000-8000-000000000002', '{"mimetype":"image/jpeg","size":100}'),
  ('amano-professional-images', 'professionals/71000000-0000-4000-8000-000000000003/72000000-0000-4000-8000-000000000003.jpg', '70000000-0000-4000-8000-000000000003', '{"mimetype":"image/jpeg","size":100}');

select plan(53);
select is((select public from storage.buckets where id = 'amano-professional-images'), false, 'El bucket de imágenes siempre es privado');
select is((select file_size_limit from storage.buckets where id = 'amano-professional-images'), 5242880::bigint, 'El bucket limita cada objeto a 5 MiB');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::integer from storage.objects where bucket_id = 'amano-professional-images' and name like 'professionals/71000000-0000-4000-8000-000000000001/%'), 1, 'El visitante solo ve imágenes de perfiles aprobados y publicados');
select is((select count(*)::integer from public.get_professional_image('72000000-0000-4000-8000-000000000002')), 0, 'La ruta de lectura no devuelve imágenes de perfiles pendientes');
select is((select count(*)::integer from public.get_professional_image('72000000-0000-4000-8000-000000000003')), 0, 'La ruta de lectura no devuelve imágenes de perfiles suspendidos');
select is((select count(*)::integer from public.get_public_professional_images('storage-public-fixture')), 1, 'La lista pública expone la foto de un perfil aprobado y publicado');
select is((select count(*)::integer from public.get_public_professional_images('storage-pending-fixture')), 0, 'La lista pública no incluye las fotos de un perfil pendiente');
select ok(not private.can_read_professional_image_upload('uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg'), 'El helper de lectura tampoco autoriza a visitantes a leer una ruta temporal');
select ok(
  not has_function_privilege('anon', 'public.reserve_professional_image(uuid,text,text,text,integer,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mark_professional_image_uploaded(uuid,text,text,integer,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cancel_professional_image_upload(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_own_professional_images()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_professional_image_upload(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.clear_professional_image_upload_path(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.begin_professional_image_delete_paths(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.finish_professional_image_delete(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_admin_professional_images(uuid[])', 'EXECUTE'),
  'Los RPC de gestión, limpieza y moderación no conceden EXECUTE a anon'
);
select ok(
  has_function_privilege('anon', 'public.get_professional_image(uuid)', 'EXECUTE')
  and has_function_privilege('anon', 'public.get_public_professional_images(text)', 'EXECUTE'),
  'Anon puede ejecutar los dos RPC públicos de imágenes comprobados'
);
select throws_ok('select * from private.professional_images', '42501', null, 'La tabla de metadatos no se expone a visitantes');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(
  has_function_privilege('authenticated', 'public.reserve_professional_image(uuid,text,text,text,integer,integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.mark_professional_image_uploaded(uuid,text,text,integer,integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.cancel_professional_image_upload(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_own_professional_images()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_professional_image_upload(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.clear_professional_image_upload_path(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.begin_professional_image_delete_paths(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.finish_professional_image_delete(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_admin_professional_images(uuid[])', 'EXECUTE'),
  'Los usuarios autenticados pueden invocar los RPC de imágenes, sujetos a sus controles de titularidad y rol'
);
select is((select count(*)::integer from storage.objects where bucket_id = 'amano-professional-images' and (name like 'professionals/71000000-0000-4000-8000-000000000001/%' or name like 'professionals/71000000-0000-4000-8000-000000000002/%')), 2, 'El dueño puede leer su propia imagen pendiente y las imágenes que ya son públicas');
select is((select count(*)::integer from public.get_own_professional_images()), 2, 'El listado de gestión está limitado al perfil del usuario autenticado');
select lives_ok($$select * from public.reserve_professional_image('71000000-0000-4000-8000-000000000002', 'portfolio', 'image/jpeg', 'jpg', 100, 10, 10)$$, 'El dueño puede reservar una imagen con dimensiones y formato válidos');
select is(private.can_upload_professional_image('uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg'), true, 'Storage autoriza únicamente la ruta temporal reservada por el dueño');
select is(private.can_upload_professional_image('uploading/71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000004.jpg'), false, 'La política de carga no autoriza rutas de otro usuario');
select is((select count(*)::integer from public.get_professional_image_upload('72000000-0000-4000-8000-000000000004')), 1, 'El propietario puede consultar su reserva para completar la carga');
select is((select count(*)::integer from storage.objects where name like 'professionals/71000000-0000-4000-8000-000000000003/%'), 0, 'Un usuario no puede leer imágenes de un perfil suspendido ajeno');
select is(private.can_delete_professional_image('professionals/71000000-0000-4000-8000-000000000003/72000000-0000-4000-8000-000000000003.jpg'), false, 'La política no autoriza borrar objetos de otro profesional');
select throws_ok($$select * from public.get_admin_professional_images(array['71000000-0000-4000-8000-000000000002'::uuid])$$, '42501', null, 'Un profesional no puede consultar la galería privada de moderación');
select throws_ok($$select * from public.reserve_professional_image('71000000-0000-4000-8000-000000000001', 'portfolio', 'image/jpeg', 'jpg', 100, 10, 10)$$, '42501', null, 'Un usuario no puede reservar una imagen para el perfil de otra persona');
select lives_ok($$insert into storage.objects(bucket_id, name, owner_id, metadata) values ('amano-professional-images', 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg', auth.uid(), '{"mimetype":"image/jpeg","size":100}')$$, 'Storage acepta una carga solo después de reservar su ruta temporal como propietario');
select is((select count(*)::integer from storage.objects where bucket_id = 'amano-professional-images' and name like 'uploading/%'), 1, 'El propietario puede leer su temporal privado');
select is(private.can_delete_professional_image('uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg'), true, 'El propietario puede borrar su temporal reservado');
select is(private.can_delete_professional_image('uploading/71000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-000000000004.jpg'), false, 'El propietario no puede borrar temporales ajenos');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::integer from storage.objects where bucket_id = 'amano-professional-images' and name like 'uploading/%'), 0, 'Los visitantes no pueden leer cargas temporales');
select is((select count(*)::integer from storage.objects where bucket_id = 'amano-professional-images' and name = 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg'), 0, 'Un visitante no puede leer por ruta directa el objeto temporal de otro usuario');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$insert into storage.objects(bucket_id, name, owner_id, metadata) values ('amano-professional-images', 'professionals/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg', auth.uid(), '{"mimetype":"image/jpeg","size":100}')$$, '42501', null, 'El navegador no puede escribir directamente en la ruta final sanitizada');
select throws_ok($$insert into storage.objects(bucket_id, name, owner_id, metadata) values ('amano-professional-images', 'otro/archivo.jpg', auth.uid(), '{"mimetype":"image/jpeg","size":100}')$$, '42501', null, 'Storage rechaza rutas sin reserva autorizada');
select lives_ok($q$do $do$ begin for i in 1..6 loop perform * from public.reserve_professional_image('71000000-0000-4000-8000-000000000002', 'portfolio', 'image/jpeg', 'jpg', 100, 10, 10); end loop; end $do$$q$, 'Se pueden reservar hasta ocho fotos de trabajos por perfil');
select throws_ok($$select * from public.reserve_professional_image('71000000-0000-4000-8000-000000000002', 'portfolio', 'image/jpeg', 'jpg', 100, 10, 10)$$, '23514', null, 'La novena foto de trabajos se rechaza en la base');
select throws_ok($$select * from public.reserve_professional_image('71000000-0000-4000-8000-000000000002', 'profile', 'image/jpeg', 'jpg', 100, 10, 10)$$, '23505', null, 'Se limita a una foto principal por perfil');
select is((select count(*)::integer from public.get_professional_image_upload('72000000-0000-4000-8000-000000000001')), 0, 'Otro usuario no obtiene metadatos de la reserva ajena');
select throws_ok($$select * from public.begin_professional_image_delete_paths('72000000-0000-4000-8000-000000000001')$$, 'P0002', null, 'Un usuario no puede iniciar el borrado de una imagen ajena');

-- This fixture models a retry after the Storage API has already removed the
-- object. SQL pgTAP must not delete directly from Storage's internal table.
reset role;
insert into private.professional_images (id, professional_id, object_path, upload_path, image_kind, mime_type, extension, size_bytes, width, height, state) values
  ('72000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000002', 'professionals/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000005.jpg', 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000005.jpg', 'portfolio', 'image/jpeg', 'jpg', 100, 10, 10, 'cleanup_pending');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok($$select public.cancel_professional_image_upload('72000000-0000-4000-8000-000000000004')$$, 'Cancelar una carga con un objeto todavía presente conserva la reserva para limpieza');
select is((select state from public.get_own_professional_images() where id = '72000000-0000-4000-8000-000000000004'), 'cleanup_pending', 'La cancelación marca cleanup_pending cuando Storage aún contiene el temporal');
select is((select count(*)::integer from public.get_own_professional_images() where id = '72000000-0000-4000-8000-000000000004'), 1, 'La reserva no se elimina mientras siga existiendo el objeto');
select is((select upload_path from public.begin_professional_image_delete_paths('72000000-0000-4000-8000-000000000004')), 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg', 'El dueño puede reintentar el borrado desde cleanup_pending');
select lives_ok($$select public.finish_professional_image_delete('72000000-0000-4000-8000-000000000004')$$, 'Finalizar con el objeto aún presente conserva la reserva sin error');
select is((select state from public.get_own_professional_images() where id = '72000000-0000-4000-8000-000000000004'), 'cleanup_pending', 'El reintento fallido vuelve a dejar la reserva en cleanup_pending');
select is((select count(*)::integer from public.get_own_professional_images() where id = '72000000-0000-4000-8000-000000000004'), 1, 'El reintento fallido conserva los metadatos para otro intento');
reset role;
select is((select count(*)::integer from storage.objects where bucket_id = 'amano-professional-images' and name = 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg'), 1, 'El objeto sigue almacenado después del reintento fallido');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select upload_path from public.begin_professional_image_delete_paths('72000000-0000-4000-8000-000000000004')), 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000004.jpg', 'El segundo reintento devuelve la ruta temporal que debe borrarse');
select lives_ok($$select public.finish_professional_image_delete('72000000-0000-4000-8000-000000000004')$$, 'El reintento conserva la reserva mientras el objeto siga en Storage');
select is((select state from public.get_own_professional_images() where id = '72000000-0000-4000-8000-000000000004'), 'cleanup_pending', 'El segundo reintento fallido vuelve a marcar cleanup_pending');
select is((select count(*)::integer from public.get_own_professional_images() where id = '72000000-0000-4000-8000-000000000004'), 1, 'El segundo reintento fallido conserva la reserva');
select is((select upload_path from public.begin_professional_image_delete_paths('72000000-0000-4000-8000-000000000005')), 'uploading/71000000-0000-4000-8000-000000000002/72000000-0000-4000-8000-000000000005.jpg', 'El reintento posterior a la eliminación del objeto devuelve la ruta reservada');
select lives_ok($$select public.finish_professional_image_delete('72000000-0000-4000-8000-000000000005')$$, 'Al confirmar que Storage ya no tiene el objeto, se puede finalizar la limpieza');
select is((select count(*)::integer from public.get_own_professional_images() where id = '72000000-0000-4000-8000-000000000005'), 0, 'La reserva se elimina cuando no existe el objeto en Storage');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from storage.objects where bucket_id = 'amano-professional-images' and (name like 'professionals/71000000-0000-4000-8000-000000000001/%' or name like 'professionals/71000000-0000-4000-8000-000000000002/%' or name like 'professionals/71000000-0000-4000-8000-000000000003/%')), 3, 'El administrador puede revisar imágenes privadas de cualquier estado');
select is((select count(*)::integer from public.get_professional_image('72000000-0000-4000-8000-000000000002')), 1, 'El administrador puede abrir una imagen pendiente para moderación');
select is((select count(*)::integer from public.get_admin_professional_images(array['71000000-0000-4000-8000-000000000001'::uuid, '71000000-0000-4000-8000-000000000002'::uuid, '71000000-0000-4000-8000-000000000003'::uuid])), 3, 'La consulta de revisión devuelve solo metadatos y fotos autorizadas al administrador');

select * from finish();
rollback;
