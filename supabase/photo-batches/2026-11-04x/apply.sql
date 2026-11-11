-- batch 2026 11x: image intent fixes. This batch changes code and static files only.
-- No database row needs a write: the 8 Christmas licensed covers, the static galleries and the
-- runtime venue photo holds all live in the repo. This file is a read only check.
select event_id, slug, left(hero_image, 120) as hero
from wf_events
where event_id in ('nightgarden-fairchild-2026', 'zootampa-christmas-wild-2026', 'charlie-brown-christmas-ruth-eckerd-2026');
