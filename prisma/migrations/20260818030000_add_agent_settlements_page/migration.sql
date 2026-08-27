-- Grant the new CRM "Agent Settlements" page (cross-agent settlement
-- request queue) to the built-in admin role. Matched case-insensitively —
-- several earlier page-grant migrations matched "name" = 'Admin' (exact
-- case) while the actual built-in role is lowercase 'admin', silently
-- failing the grant in production.
INSERT INTO "pages" ("path", "label", "section")
VALUES
  ('/dashboard/agent-settlements', 'Agent Settlements', 'Menu')
ON CONFLICT ("path") DO NOTHING;

INSERT INTO "role_pages" ("role_id", "page_path")
SELECT "id", p."path"
FROM "roles", (VALUES ('/dashboard/agent-settlements')) AS p("path")
WHERE LOWER("roles"."name") = 'admin' AND "roles"."is_built_in" = true
ON CONFLICT ("role_id", "page_path") DO NOTHING;
