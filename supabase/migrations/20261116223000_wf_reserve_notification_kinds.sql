-- Widen wf_reserve_notifications for the rest of the booking texts and records.
-- Apply only after 20261116120000_wf_reserve_notifications.sql. Do not edit that file.
-- Additive: existing confirmation_sms rows stay valid. Rollback is the previous check
-- constraints (kind confirmation_sms only, channel sms, status without recorded,
-- recipient required). No new table, no grant, RLS stays on with no policies.
--
-- recorded + channel none is a row we deliberately did not text (OpenTable handoff,
-- booking failure, or a cancellation the guest did not agree to be texted about).
-- A text still requires an E.164 recipient.

alter table public.wf_reserve_notifications drop constraint wf_reserve_notifications_kind_check;
alter table public.wf_reserve_notifications add constraint wf_reserve_notifications_kind_check
  check (kind in (
    'confirmation_sms',
    'request_received_sms',
    'request_accepted_sms',
    'request_declined_sms',
    'opentable_handoff',
    'cancellation_sms',
    'failure_sms'
  ));

alter table public.wf_reserve_notifications drop constraint wf_reserve_notifications_status_check;
alter table public.wf_reserve_notifications add constraint wf_reserve_notifications_status_check
  check (status in ('queued', 'accepted', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'unknown', 'recorded'));

alter table public.wf_reserve_notifications drop constraint wf_reserve_notifications_channel_check;
alter table public.wf_reserve_notifications add constraint wf_reserve_notifications_channel_check
  check (channel in ('sms', 'none'));

alter table public.wf_reserve_notifications alter column recipient drop not null;
alter table public.wf_reserve_notifications drop constraint wf_reserve_notifications_recipient_check;
alter table public.wf_reserve_notifications add constraint wf_reserve_notifications_recipient_check
  check (recipient is null or recipient ~ '^\+[1-9][0-9]{7,14}$');
alter table public.wf_reserve_notifications add constraint wf_reserve_notifications_sms_needs_recipient
  check (channel = 'none' or recipient is not null);

comment on table public.wf_reserve_notifications is
  'Guest booking notifications. One row per (booking, kind). Text kinds store the guest consent and a Twilio message id. Recorded rows (channel none, status recorded) are kinds we chose not to text. Service role only.';
