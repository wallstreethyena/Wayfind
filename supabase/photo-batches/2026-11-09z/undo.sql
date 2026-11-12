-- Photo batch 2026 11z writes no database rows. Undo is a git revert of the
-- batch commit, which removes the static gallery files and the additions map.
select 1 as nothing_to_undo;
