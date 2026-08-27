-- The CRM sidebar now shows this page as "Agent" (its route/underlying
-- data model are unchanged) — keep the DB-driven role-management page
-- picker (which reads this label live) in sync with the sidebar.
UPDATE "pages" SET "label" = 'Agent' WHERE "path" = '/dashboard/payment-accounts';
