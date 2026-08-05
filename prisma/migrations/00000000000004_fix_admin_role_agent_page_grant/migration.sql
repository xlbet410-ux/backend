-- The earlier grant (migration 00000000000002) matched the built-in admin
-- role by the exact name "Admin". Production's built-in role is actually
-- named "admin" (lowercase), so that grant silently matched zero rows there
-- and the Agent page never showed up in the sidebar. Match case-insensitively
-- this time so it's correct regardless of casing.
INSERT INTO "role_pages" ("role_id", "page_path")
SELECT "id", '/dashboard/payment-accounts' FROM "roles" WHERE LOWER("name") = 'admin' AND "is_built_in" = true
ON CONFLICT ("role_id", "page_path") DO NOTHING;
