-- Grant the new CRM VIP Levels page to the same pages/roles setup as every
-- other existing page (there's no automated seed for this — pages/role_pages
-- rows have always been inserted by hand alongside their migration).
INSERT INTO "pages" ("path", "label", "section")
VALUES ('/dashboard/vip-tiers', 'VIP Levels', 'Marketing')
ON CONFLICT ("path") DO NOTHING;

INSERT INTO "role_pages" ("role_id", "page_path")
SELECT "id", '/dashboard/vip-tiers' FROM "roles" WHERE "name" = 'Admin' AND "is_built_in" = true
ON CONFLICT ("role_id", "page_path") DO NOTHING;
