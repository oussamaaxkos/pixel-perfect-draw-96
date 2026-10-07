<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Company data access is mediated by versioned, administrator-approved semantic manifests; the agent never receives arbitrary SQL or unapproved fields because source schemas differ and may contain sensitive data.
- External PostgreSQL connections must use a read-only role and execute through parameterized, allowlisted queries inside read-only transactions because credentials alone must never grant mutation capability.
- Only the configured, verified Google administrator is granted the database-backed admin role because connection credentials and company data setup are privileged operations.
