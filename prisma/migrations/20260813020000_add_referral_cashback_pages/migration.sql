-- Grant the new CRM Referrals + Cashback pages to the same pages/roles setup
-- as every other existing page — pages/role_pages rows have always been
-- inserted by hand alongside their migration.
INSERT INTO "pages" ("path", "label", "section")
VALUES
  ('/dashboard/referrals', 'Referrals', 'Marketing'),
  ('/dashboard/cashback', 'Cashback', 'Marketing')
ON CONFLICT ("path") DO NOTHING;

INSERT INTO "role_pages" ("role_id", "page_path")
SELECT "id", p."path"
FROM "roles", (VALUES ('/dashboard/referrals'), ('/dashboard/cashback')) AS p("path")
WHERE "roles"."name" = 'Admin' AND "roles"."is_built_in" = true
ON CONFLICT ("role_id", "page_path") DO NOTHING;
