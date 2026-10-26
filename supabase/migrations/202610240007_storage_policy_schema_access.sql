begin;

-- Storage RLS invoca funciones en el esquema privado. Dar USAGE no concede
-- acceso a tablas: cada función conserva sus privilegios EXECUTE explícitos.
grant usage on schema private to anon, authenticated;

commit;
