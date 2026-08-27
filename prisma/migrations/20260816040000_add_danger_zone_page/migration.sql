-- Grant the new CRM Danger Zone page (platform data reset) to the same
-- pages/roles setup as every other existing page.
INSERT INTO "pages" ("path", "label", "section")
VALUES
  ('/dashboard/danger-zone', 'Danger Zone', 'Settings')
ON CONFLICT ("path") DO NOTHING;

INSERT INTO "role_pages" ("role_id", "page_path")
SELECT "id", p."path"
FROM "roles", (VALUES ('/dashboard/danger-zone')) AS p("path")
WHERE "roles"."name" = 'Admin' AND "roles"."is_built_in" = true
ON CONFLICT ("role_id", "page_path") DO NOTHING;
