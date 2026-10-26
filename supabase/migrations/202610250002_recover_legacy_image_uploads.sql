begin;

-- Existing in-flight uploads used object_path as the original upload key.
-- Keep them private and deletable through the new staging cleanup workflow.
update private.professional_images
set upload_path = object_path, updated_at = now()
where state = 'uploading' and upload_path is null;

commit;
