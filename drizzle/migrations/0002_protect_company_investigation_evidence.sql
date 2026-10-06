ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.data_sources(id);
CREATE POLICY "Private company runs require admin" ON public.agent_runs AS RESTRICTIVE FOR SELECT TO public USING (source_id IS NULL OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Private company steps require admin" ON public.agent_steps AS RESTRICTIVE FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = run_id));
CREATE POLICY "Private company tool calls require admin" ON public.tool_calls AS RESTRICTIVE FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = run_id));
CREATE POLICY "Private company approvals require admin" ON public.approvals AS RESTRICTIVE FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = run_id));
CREATE POLICY "Private company audit requires admin" ON public.audit_logs AS RESTRICTIVE FOR SELECT TO public USING (run_id IS NULL OR EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = run_id));
CREATE POLICY "Private company evaluations require admin" ON public.evaluation_results AS RESTRICTIVE FOR SELECT TO public USING (run_id IS NULL OR EXISTS (SELECT 1 FROM public.agent_runs r WHERE r.id = run_id));
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon;
