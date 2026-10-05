CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'operator', 'viewer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(8741201);
  IF auth.uid() IS NULL OR EXISTS (SELECT 1 FROM public.user_roles) THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'admin');
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;

CREATE TABLE public.company_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_workspaces TO authenticated;
GRANT ALL ON public.company_workspaces TO service_role;
ALTER TABLE public.company_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage company workspace" ON public.company_workspaces FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.company_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('built_in', 'neon', 'supabase', 'csv', 'xlsx')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'discovered', 'review_required', 'active', 'failed', 'disconnected')),
  connection_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_credentials text,
  credential_iv text,
  last_error text,
  last_discovered_at timestamptz,
  activated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_sources TO authenticated;
GRANT ALL ON public.data_sources TO service_role;
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage data sources" ON public.data_sources FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX one_active_data_source ON public.data_sources ((status)) WHERE status = 'active';

CREATE TABLE public.schema_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  version integer NOT NULL,
  schema_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  diff_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, version)
);
GRANT SELECT, INSERT ON public.schema_snapshots TO authenticated;
GRANT ALL ON public.schema_snapshots TO service_role;
ALTER TABLE public.schema_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read schema snapshots" ON public.schema_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.source_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.schema_snapshots(id) ON DELETE CASCADE,
  source_schema text NOT NULL DEFAULT 'public',
  source_table text NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(snapshot_id, source_schema, source_table)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_topics TO authenticated;
GRANT ALL ON public.source_topics TO service_role;
ALTER TABLE public.source_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage source topics" ON public.source_topics FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.source_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.source_topics(id) ON DELETE CASCADE,
  source_column text NOT NULL,
  display_name text NOT NULL,
  data_type text NOT NULL,
  semantic_type text NOT NULL DEFAULT 'attribute' CHECK (semantic_type IN ('identifier', 'attribute', 'measure', 'date', 'status')),
  access_level text NOT NULL DEFAULT 'excluded' CHECK (access_level IN ('safe', 'masked', 'excluded')),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(topic_id, source_column)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_fields TO authenticated;
GRANT ALL ON public.source_fields TO service_role;
ALTER TABLE public.source_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage source fields" ON public.source_fields FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.imported_rows (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  topic_name text NOT NULL,
  row_index integer NOT NULL,
  row_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, topic_name, row_index)
);
GRANT SELECT, INSERT, DELETE ON public.imported_rows TO authenticated;
GRANT ALL ON public.imported_rows TO service_role;
ALTER TABLE public.imported_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage imported rows" ON public.imported_rows FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.source_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.schema_snapshots(id),
  mapping_manifest jsonb NOT NULL,
  activated_by uuid NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.source_activations TO authenticated;
GRANT ALL ON public.source_activations TO service_role;
ALTER TABLE public.source_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read activations" ON public.source_activations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
