-- Register the new CRM "Games" page (game catalog + image/launch-UID
-- overrides) in the pages table — role_pages.page_path has a foreign key
-- into pages.path, so checking it in the CRM's role editor without this
-- row existing fails with a foreign-key violation (Internal Server Error)
-- on save. Also grants it to the built-in admin role, same as every
-- earlier new-page migration.
INSERT INTO "pages" ("path", "label", "section")
VALUES
  ('/dashboard/games', 'Games', 'Menu')
ON CONFLICT ("path") DO NOTHING;

INSERT INTO "role_pages" ("role_id", "page_path")
SELECT "id", p."path"
FROM "roles", (VALUES ('/dashboard/games')) AS p("path")
WHERE LOWER("roles"."name") = 'admin' AND "roles"."is_built_in" = true
ON CONFLICT ("role_id", "page_path") DO NOTHING;
