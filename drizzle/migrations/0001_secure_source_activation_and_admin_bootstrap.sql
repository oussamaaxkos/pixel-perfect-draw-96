REVOKE ALL ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.claim_first_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;
REVOKE SELECT ON public.data_sources FROM authenticated;
GRANT SELECT (id, workspace_id, name, source_type, status, connection_config, last_error, last_discovered_at, activated_at, created_by, created_at, updated_at) ON public.data_sources TO authenticated;
ALTER TABLE public.company_workspaces ADD COLUMN IF NOT EXISTS business_context text NOT NULL DEFAULT '';
ALTER TABLE public.source_fields ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION public.activate_reviewed_source(_source_id uuid, _snapshot_id uuid, _manifest jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  PERFORM pg_advisory_xact_lock(8741202);
  IF NOT EXISTS (SELECT 1 FROM public.schema_snapshots WHERE id = _snapshot_id AND source_id = _source_id) THEN RAISE EXCEPTION 'Invalid snapshot'; END IF;
  UPDATE public.data_sources SET status = 'review_required' WHERE status = 'active';
  UPDATE public.data_sources SET status = 'active', activated_at = now(), updated_at = now() WHERE id = _source_id AND status <> 'disconnected';
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable'; END IF;
  INSERT INTO public.source_activations(source_id, snapshot_id, mapping_manifest, activated_by) VALUES (_source_id, _snapshot_id, _manifest, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.activate_reviewed_source(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_reviewed_source(uuid, uuid, jsonb) TO authenticated;
