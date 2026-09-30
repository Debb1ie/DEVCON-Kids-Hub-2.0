-- REVIEW ONLY. Do not apply without explicit approval.
-- Merges non-canonical Iloilo chapter records (for example "Ilo Ilo") into the
-- canonical "Iloilo" chapter. The repository never seeds "Ilo Ilo"; the
-- duplicate exists only as data, because chapters_normalized_name_uidx
-- compares lower(btrim(name)) and treats "ilo ilo" and "iloilo" as different.
--
-- Every foreign key that references public.chapters is discovered from the
-- catalog and repointed to the canonical row before the duplicate is removed,
-- so user roles, events, volunteers, reports and any later tables keep valid
-- relationships. Free-text chapter labels are normalized too. Approved report
-- snapshots already exported to Drive are historical and are not rewritten.
-- Safe to re-run: when no duplicate exists it changes nothing.

begin;

do $merge$
declare
  canonical uuid;
  duplicate record;
  fk record;
begin
  perform pg_advisory_xact_lock(hashtext('devcon_chapter_directory'));

  select c.id into canonical
  from public.chapters c
  where lower(btrim(c.name)) = 'iloilo'
  order by c.created_at, c.id
  limit 1;

  for duplicate in
    select c.* from public.chapters c
    where lower(regexp_replace(c.name, '[^A-Za-z]', '', 'g')) = 'iloilo'
      and c.id is distinct from canonical
    order by c.created_at, c.id
  loop
    if canonical is null then
      update public.chapters set name = 'Iloilo' where id = duplicate.id;
      canonical := duplicate.id;
      continue;
    end if;

    for fk in
      select ns.nspname as schema_name, cl.relname as table_name, att.attname as column_name
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      where con.contype = 'f'
        and con.confrelid = 'public.chapters'::regclass
        and array_length(con.conkey, 1) = 1
    loop
      execute format('update %I.%I set %I = $1 where %I = $2', fk.schema_name, fk.table_name, fk.column_name, fk.column_name)
        using canonical, duplicate.id;
    end loop;

    -- Keep the larger dashboard counters instead of adding them (no double count).
    update public.chapters c
    set learners = greatest(c.learners, duplicate.learners),
        workshops = greatest(c.workshops, duplicate.workshops),
        completion = greatest(c.completion, duplicate.completion),
        status = case when duplicate.status = 'active' then 'active' else c.status end
    where c.id = canonical;

    delete from public.chapters where id = duplicate.id;

    insert into public.audit_logs(actor_id, action, target_table, target_id, metadata)
    values (null, 'CHAPTER_MERGED', 'chapters', canonical,
      jsonb_build_object('merged_chapter_id', duplicate.id, 'merged_name', duplicate.name, 'canonical_name', 'Iloilo'));
  end loop;

  if canonical is not null then
    update public.chapters set name = 'Iloilo' where id = canonical and name <> 'Iloilo';
  end if;

  -- Free-text chapter labels kept by older screens.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'chapter') then
    update public.events set chapter = 'Iloilo'
    where chapter <> 'Iloilo' and lower(regexp_replace(chapter, '[^A-Za-z]', '', 'g')) = 'iloilo';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'volunteers' and column_name = 'chapter') then
    update public.volunteers set chapter = 'Iloilo'
    where chapter <> 'Iloilo' and lower(regexp_replace(chapter, '[^A-Za-z]', '', 'g')) = 'iloilo';
  end if;
end
$merge$;

do $verify$
begin
  if (select count(*) from public.chapters where lower(regexp_replace(name, '[^A-Za-z]', '', 'g')) = 'iloilo') > 1 then
    raise exception 'Iloilo chapter merge verification failed';
  end if;
end
$verify$;

commit;

-- Verification:
-- select id, name, status from public.chapters where lower(regexp_replace(name, '[^A-Za-z]', '', 'g')) = 'iloilo';
-- select * from public.audit_logs where action = 'CHAPTER_MERGED' order by created_at desc;
-- Rollback: the merge is recorded in audit_logs (merged_chapter_id, merged_name).
-- Restoring the duplicate is not recommended because it recreates the bug.
