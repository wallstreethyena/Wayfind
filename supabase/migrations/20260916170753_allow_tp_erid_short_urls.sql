-- Travelpayouts short links can include its ERID disclosure token.
-- Keep the database constraint aligned with the server validator: only the
-- erid query parameter is accepted; arbitrary query strings remain rejected.
alter table public.wf_tp_links
  drop constraint if exists wf_tp_links_short_check;

alter table public.wf_tp_links
  add constraint wf_tp_links_short_check
  check (short_url ~ '^https://([A-Za-z0-9-]+\.)?tp\.st/[A-Za-z0-9_-]+(\?erid=[A-Za-z0-9_-]+)?$');
