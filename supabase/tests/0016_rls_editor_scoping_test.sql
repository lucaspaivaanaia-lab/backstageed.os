-- Item 3 of the 2026-08-05 Juliano action plan's P3 ("novo papel de acesso
-- Editor", 260811-lp5-CONTEXT.md item 3; 260811-oe0-RESEARCH.md/-CONTEXT.md).
--
-- Proves, at the Postgres RLS layer, the core visibility guarantee: an
-- Editor sees ONLY cards where they are media_assignee_id -- across every
-- client (cross-client is correct, by design) -- and NOTHING else:
--   * NOT a card where they are only assignee_id/"Responsável"
--   * NOT another Editor's card, even on a client where they DO have one
--     (proves the branch is media_assignee_id-scoped, never client-wide)
--   * a `clients` row ONLY for clients where they have an actual card, via
--     the narrow branch, never any other client
--   * `card_checklist_items`/`card_attachments`: same media_assignee_id
--     scoping, and Editor reaches checklist UPDATE (toggle) but NEVER
--     INSERT/DELETE on checklist items, and NEVER INSERT on attachments
--   * `messages`/`client_files`: ZERO access, even for a client the
--     Editor DOES have a card on -- both stay entirely out of scope
--     (260811-oe0-CONTEXT.md, RESEARCH.md Section 2 rows 11/12)
-- Exercises migration 0031_editor_role_rls_and_due_date.sql. Nothing is
-- redefined here.

begin;
select plan(16);

\ir rls_helpers.sql

-- ---------------------------------------------------------------------------
-- Fixture, local to this file (rls_helpers.sql itself is never edited):
--   editor_a = 33333333-3333-3333-3333-333333333333 (role=editor)
--   editor_b = 44444444-4444-4444-4444-444444444444 (role=editor, used only
--     to prove editor_a does NOT get client-wide access)
--   client_c = 55555555-5555-5555-5555-555555555555 (no card ever assigned
--     to editor_a -- proves the clients_select_scoped branch is genuinely
--     narrow, not "every client that exists")
-- Both editor_a/editor_b auto-land status='approved' via handle_new_user()
-- (migration 0031, point 6) -- no manual status correction needed, unlike
-- rls_helpers.sql's own pm_a/admin_user.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'editor_a@rls-fixture.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"editor"}',
   now(), now(),
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'editor_b@rls-fixture.local', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"editor"}',
   now(), now(),
   '', '', '', '')
on conflict (id) do nothing;

insert into public.clients (id, name, tag)
values ('55555555-5555-5555-5555-555555555555', 'RLS Test Client C (client_c, sem cards do editor_a)', 'RLS-TEST-CLIENT-C')
on conflict (id) do nothing;

-- Cards, seeded as the session-owner role (postgres), before authenticating
-- as editor_a:
--   card_ea1            client_a, media_assignee_id = editor_a -- visible
--   card_eb1            client_a, media_assignee_id = editor_b -- NOT
--                        visible to editor_a (same client, different
--                        editor -- proves this is not client-wide access)
--   card_assignee_only  client_a, assignee_id = pm_a, media_assignee_id
--                        null -- NOT visible to editor_a (Responsável never
--                        grants Editor visibility, 260811-oe0-CONTEXT.md)
--   card_ea2_clientb    client_b, media_assignee_id = editor_a -- visible
--                        (cross-client is correct, by design)
insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
values (
  '10101010-1010-1010-1010-101010101010',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Card do editor_a (client_a)', 'briefing',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
values (
  '20202020-2020-2020-2020-202020202020',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Card do editor_b (client_a)', 'briefing',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '44444444-4444-4444-4444-444444444444'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by, assignee_id)
values (
  '30303030-3030-3030-3030-303030303030',
  '11111111-1111-1111-1111-111111111111',
  'single', 'Card so com Responsavel (client_a)', 'briefing',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

insert into public.cards (id, client_id, card_type, title, stage, created_by, media_assignee_id)
values (
  '40404040-4040-4040-4040-404040404040',
  '22222222-2222-2222-2222-222222222222',
  'single', 'Card do editor_a (client_b, cross-client)', 'briefing',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '33333333-3333-3333-3333-333333333333'
);

insert into public.card_checklist_items (id, card_id, label, sort_order)
values
  ('50505050-5050-5050-5050-505050505050', '10101010-1010-1010-1010-101010101010', 'Item do card do editor_a', 0),
  ('60606060-6060-6060-6060-606060606060', '20202020-2020-2020-2020-202020202020', 'Item do card do editor_b', 0);

insert into public.card_attachments (id, card_id, url, link_type, created_by)
values
  ('70707070-7070-7070-7070-707070707070', '10101010-1010-1010-1010-101010101010', 'https://drive.google.com/file/d/editor-a-anexo', 'other', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('80808080-8080-8080-8080-808080808080', '20202020-2020-2020-2020-202020202020', 'https://drive.google.com/file/d/editor-b-anexo', 'other', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

insert into public.messages (id, client_id, role, content)
values ('90909090-9090-9090-9090-909090909090', '11111111-1111-1111-1111-111111111111', 'user', 'Mensagem de client_a -- fora do escopo do Editor');

insert into public.client_files (id, client_id, filename, file_type, content)
values ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', '11111111-1111-1111-1111-111111111111', 'arquivo.txt', 'text/plain', 'Conteudo de client_a -- fora do escopo do Editor');

-- Authenticate as editor_a.
select tests.set_auth('33333333-3333-3333-3333-333333333333');

-- 1. editor_a ve o proprio card via media_assignee_id.
select ok(
  exists(select 1 from public.cards where id = '10101010-1010-1010-1010-101010101010'),
  'editor_a ve seu proprio card via media_assignee_id'
);

-- 2. editor_a NAO ve o card do editor_b, mesmo no MESMO cliente -- prova
-- que o branch nao e client-wide.
select ok(
  not exists(select 1 from public.cards where id = '20202020-2020-2020-2020-202020202020'),
  'editor_a NAO ve card de outro editor no mesmo cliente (nao e acesso client-wide)'
);

-- 3. editor_a NAO ve o card onde e apenas assignee_id/Responsavel.
select ok(
  not exists(select 1 from public.cards where id = '30303030-3030-3030-3030-303030303030'),
  'editor_a NAO ve card onde e apenas assignee_id/Responsavel'
);

-- 4. editor_a ve seu card em OUTRO cliente -- cross-client e correto, por
-- desenho (media_assignee_id nao tem fronteira de cliente).
select ok(
  exists(select 1 from public.cards where id = '40404040-4040-4040-4040-404040404040'),
  'editor_a ve seu card em outro cliente (media_assignee_id e cross-client por desenho)'
);

-- 5. clients: editor_a ve o client_b porque tem um card la -- o branch
-- estreito de clients_select_scoped.
select ok(
  exists(select 1 from public.clients where id = '22222222-2222-2222-2222-222222222222'),
  'editor_a ve o client_b porque tem um card la (branch estreita de clients_select_scoped)'
);

-- 6. clients: editor_a NAO ve o client_c, onde nao tem nenhum card.
select ok(
  not exists(select 1 from public.clients where id = '55555555-5555-5555-5555-555555555555'),
  'editor_a NAO ve o client_c, onde nao tem nenhum card'
);

-- 7. card_checklist_items: editor_a ve o item do proprio card.
select results_eq(
  $$ select count(*) from public.card_checklist_items where card_id = '10101010-1010-1010-1010-101010101010' $$,
  $$ values (1::bigint) $$,
  'editor_a ve o item de checklist do proprio card'
);

-- 8. card_checklist_items: editor_a NAO ve o item do card do editor_b.
select results_eq(
  $$ select count(*) from public.card_checklist_items where card_id = '20202020-2020-2020-2020-202020202020' $$,
  $$ values (0::bigint) $$,
  'editor_a NAO ve o item de checklist do card de outro editor'
);

-- 9. card_checklist_items: editor_a CONSEGUE marcar/desmarcar (UPDATE) um
-- item do proprio card -- o mesmo caminho que toggleChecklistItem usa.
select lives_ok(
  $$ update public.card_checklist_items
     set completed_at = now(), completed_by = '33333333-3333-3333-3333-333333333333'
     where id = '50505050-5050-5050-5050-505050505050' $$,
  'editor_a consegue marcar um item de checklist do proprio card (UPDATE)'
);

-- 10. card_checklist_items: editor_a NAO CONSEGUE inserir um item novo,
-- mesmo no proprio card (card_checklist_items_insert_scoped e
-- PM/Admin-only).
select throws_like(
  $$ insert into public.card_checklist_items (card_id, label, sort_order)
     values ('10101010-1010-1010-1010-101010101010', 'Item inserido pelo editor_a', 1) $$,
  '%row-level security%',
  'editor_a NAO consegue inserir um item de checklist novo, mesmo no proprio card'
);

-- 11. card_checklist_items: editor_a NAO CONSEGUE deletar um item, mesmo no
-- proprio card -- bloqueado ja na camada de GRANT
-- (0016_card_checklist_items.sql nunca concedeu DELETE a `authenticated`),
-- antes mesmo da RLS.
select throws_like(
  $$ delete from public.card_checklist_items where id = '50505050-5050-5050-5050-505050505050' $$,
  '%permission denied%',
  'editor_a NAO consegue deletar um item de checklist, mesmo no proprio card'
);

-- 12. card_attachments: editor_a ve o anexo do proprio card.
select results_eq(
  $$ select count(*) from public.card_attachments where card_id = '10101010-1010-1010-1010-101010101010' $$,
  $$ values (1::bigint) $$,
  'editor_a ve o anexo do proprio card'
);

-- 13. card_attachments: editor_a NAO ve o anexo do card do editor_b.
select results_eq(
  $$ select count(*) from public.card_attachments where card_id = '20202020-2020-2020-2020-202020202020' $$,
  $$ values (0::bigint) $$,
  'editor_a NAO ve o anexo do card de outro editor'
);

-- 14. card_attachments: editor_a NAO CONSEGUE inserir um anexo, mesmo no
-- proprio card (card_attachments_insert_scoped continua PM/Admin-only,
-- inalterada).
select throws_like(
  $$ insert into public.card_attachments (card_id, url, link_type, created_by)
     values ('10101010-1010-1010-1010-101010101010', 'https://drive.google.com/file/d/x', 'other', '33333333-3333-3333-3333-333333333333') $$,
  '%row-level security%',
  'editor_a NAO consegue inserir um anexo, mesmo no proprio card'
);

-- 15. messages: editor_a NAO ve nenhuma mensagem, mesmo em um cliente onde
-- tem card -- messages fica inteiramente fora do escopo do Editor.
select results_eq(
  $$ select count(*) from public.messages where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (0::bigint) $$,
  'editor_a NAO ve nenhuma mensagem, mesmo em cliente onde tem card'
);

-- 16. client_files: editor_a NAO ve nenhum arquivo do cliente, mesma logica.
select results_eq(
  $$ select count(*) from public.client_files where client_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values (0::bigint) $$,
  'editor_a NAO ve nenhum arquivo de cliente, mesmo em cliente onde tem card'
);

-- De-authenticate before the transaction rolls back.
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
