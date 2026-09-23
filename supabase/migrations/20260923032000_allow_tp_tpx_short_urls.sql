-- Travelpayouts issues short links on two verified domain families: the
-- classic tp.st shortener and the "Drive" per-brand tpx.lu shortener (see
-- lib/travelpayouts.js tpxHost: "tiqets.tpx.lu" / "gocity.tpx.lu", and
-- lib/travelpayoutsProvisioning.js validTpShortUrl(), fixed alongside this
-- migration). This DB constraint mirrored only the tp.st family, so every
-- tpx.lu short link the provider returned was rejected at write time with a
-- 400 (wf_job_pulse: "travelpayouts_mapping_write_failed:400"), even after
-- the application-level allowlist was corrected. Keep the database
-- constraint aligned with the server validator: only the erid query
-- parameter is accepted; arbitrary query strings remain rejected.
alter table public.wf_tp_links
  drop constraint if exists wf_tp_links_short_check;

alter table public.wf_tp_links
  add constraint wf_tp_links_short_check
  check (
    short_url ~ '^https://([A-Za-z0-9-]+\.)?tp\.st/[A-Za-z0-9_-]+(\?erid=[A-Za-z0-9_-]+)?$'
    or short_url ~ '^https://[A-Za-z0-9-]+\.tpx\.lu/[A-Za-z0-9_-]+(\?erid=[A-Za-z0-9_-]+)?$'
  );
