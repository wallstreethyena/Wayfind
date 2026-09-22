-- Applied to production 2026-09-22 as launch_security_search_path_and_default_function_privileges.
-- Behavior-preserving hardening: trigger functions use only schema-qualified
-- relations (or row values), and new postgres-created functions no longer
-- inherit PUBLIC execute by default.
alter function public.wf_inventory_preserve_signals() set search_path = '';
alter function public.wf_editorial_requires_servable_place() set search_path = '';
alter default privileges for role postgres in schema public revoke execute on functions from public;
