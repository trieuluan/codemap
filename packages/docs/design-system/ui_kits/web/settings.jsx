// Settings — sidebar nav (Account / API / Team / Billing) + form controls + danger zone.
// Spec from user notes; rendered in CodeMap's existing visual vocabulary.

const SECTIONS = [
  { id: "account", label: "Account", icon: "user" },
  { id: "api", label: "API Keys", icon: "key-round" },
  { id: "team", label: "Team", icon: "users" },
  { id: "billing", label: "Billing", icon: "credit-card" },
];

function Settings() {
  const [section, setSection] = React.useState("account");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.015em", margin: 0 }}>Settings</h2>
        <p style={{ color: "var(--muted-foreground)", margin: "4px 0 0 0", fontSize: 14 }}>Manage account defaults and access credentials for CodeMap.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 32, alignItems: "flex-start" }}>
        {/* Section nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 80 }}>
          {SECTIONS.map(s => (
            <SectionItem key={s.id} item={s} active={section === s.id} onClick={() => setSection(s.id)} />
          ))}
        </nav>

        {/* Section content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {section === "account" && <AccountSection />}
          {section === "api" && <ApiKeysSection />}
          {section === "team" && <TeamSection />}
          {section === "billing" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}

function SectionItem({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 6, cursor: "pointer",
        fontSize: 13, fontWeight: 500,
        background: active ? "var(--secondary)" : hover ? "var(--accent)" : "transparent",
        color: active ? "var(--foreground)" : "color-mix(in oklch, var(--foreground) 70%, transparent)",
      }}
    >
      <Icon name={item.icon} size={14} />
      {item.label}
    </a>
  );
}

function FormRow({ label, hint, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, padding: "16px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function AccountSection() {
  const [name, setName] = React.useState("John Le");
  const [email] = React.useState("john@codemap.dev");
  const [emailNotif, setEmailNotif] = React.useState(true);
  const [importNotif, setImportNotif] = React.useState(true);
  const [productEmails, setProductEmails] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return <>
    <Card>
      <CardHeader><div><CardTitle>Profile</CardTitle><CardDescription>Your name and email as shown to teammates.</CardDescription></div></CardHeader>
      <CardContent>
        <div style={{ display: "flex", alignItems: "center", gap: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
          <Avatar initials="JL" size={56} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Avatar</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>Defaults to your initials. Upload a PNG or JPG up to 1MB.</div>
          </div>
          <Button variant="outline" size="sm">Upload</Button>
          <Button variant="ghost" size="sm">Remove</Button>
        </div>
        <FormRow label="Name" hint="Used in mentions and audit logs.">
          <Input value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 360 }} />
        </FormRow>
        <FormRow label="Email" hint="Used to sign in. Contact support to change.">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Input value={email} disabled style={{ maxWidth: 360, opacity: 0.7 }} />
            <Badge variant="success"><StatusDot />Verified</Badge>
          </div>
        </FormRow>
        <FormRow label="Default project visibility" hint="Applied to new projects unless overridden.">
          <div style={{ display: "flex", gap: 6 }}>
            {["Private", "Internal", "Public"].map((v, i) => (
              <Button key={v} variant={i === 0 ? "secondary" : "outline"} size="sm">{v}</Button>
            ))}
          </div>
        </FormRow>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 16 }}>
          <Button variant="ghost" size="sm">Cancel</Button>
          <Button size="sm">Save changes</Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><div><CardTitle>Notifications</CardTitle><CardDescription>Choose which emails CodeMap sends you.</CardDescription></div></CardHeader>
      <CardContent>
        <FormRow label="Account email" hint="Sign-in alerts and security notices. Cannot be turned off.">
          <Switch checked={emailNotif} onChange={setEmailNotif} />
        </FormRow>
        <FormRow label="Import results" hint="Notify me when an import completes or fails.">
          <Switch checked={importNotif} onChange={setImportNotif} />
        </FormRow>
        <FormRow label="Product updates" hint="Occasional emails about new CodeMap features.">
          <Switch checked={productEmails} onChange={setProductEmails} />
        </FormRow>
      </CardContent>
    </Card>

    {/* Danger zone */}
    <Card style={{ borderColor: "color-mix(in oklch, var(--destructive) 30%, var(--border))" }}>
      <CardHeader>
        <div>
          <CardTitle style={{ color: "var(--destructive)" }}>Danger zone</CardTitle>
          <CardDescription>Irreversible actions. Be sure before continuing.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <FormRow label="Transfer ownership" hint="Move all projects and API keys to another team member.">
          <Button variant="outline" size="sm">Transfer…</Button>
        </FormRow>
        <FormRow label="Delete account" hint="Permanently delete your CodeMap account, all projects, snapshots, and API keys. This cannot be undone.">
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>Delete account</Button>
        </FormRow>
      </CardContent>
    </Card>

    {confirmOpen && <ConfirmDialog onClose={() => setConfirmOpen(false)} />}
  </>;
}

function ConfirmDialog({ onClose }) {
  const [text, setText] = React.useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <Card style={{ width: 480, boxShadow: "var(--shadow-lg)" }}>
        <CardHeader><div><CardTitle>Delete account</CardTitle><CardDescription>This permanently deletes your account, all 3 projects, all snapshots, and revokes 2 API keys. This action cannot be undone.</CardDescription></div></CardHeader>
        <CardContent>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Type <span style={{ fontFamily: "var(--font-mono)", color: "var(--destructive)" }}>delete my account</span> to confirm.</div>
          <Input value={text} onChange={e => setText(e.target.value)} placeholder="delete my account" />
        </CardContent>
        <CardFooter style={{ justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" size="sm" disabled={text !== "delete my account"} onClick={onClose}>Delete account</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

const KEYS = [
  { id: 1, name: "Production MCP", type: "MCP", preview: "cm_prod_a3f9…", created: "Apr 12 · 09:14", expires: "Never", status: "active" },
  { id: 2, name: "Local CLI · MacBook Pro", type: "Manual", preview: "cm_8c2a…", created: "Apr 02 · 16:40", expires: "Jul 02 · 16:40", status: "active" },
  { id: 3, name: "CI Pipeline", type: "Manual", preview: "cm_e1b3…", created: "Mar 14 · 11:02", expires: "Apr 14 · 11:02", status: "expired" },
];

function ApiKeysSection() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Create and revoke personal keys for MCP clients, scripts, and local integrations.</CardDescription>
        </div>
        <Button size="sm">Create API key</Button>
      </CardHeader>
      <CardContent>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                {["Name","Type","Preview","Created","Expires",""].map((h,i) => (
                  <th key={i} style={{ textAlign: i === 5 ? "right" : "left", padding: "10px 12px", fontWeight: 500, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KEYS.map(k => (
                <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px", fontWeight: 500 }}>{k.name}</td>
                  <td style={{ padding: "12px" }}>{k.type === "MCP" ? <Badge variant="secondary">MCP</Badge> : <Badge variant="outline">Manual</Badge>}</td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>{k.preview}</td>
                  <td style={{ padding: "12px", color: "var(--muted-foreground)" }}>{k.created}</td>
                  <td style={{ padding: "12px", color: "var(--muted-foreground)" }}>{k.expires}</td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {k.status === "active" ? <Button variant="outline" size="sm">Revoke</Button> : <Badge variant="warning">Expired</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const MEMBERS = [
  { initials: "JL", name: "John Le", email: "john@codemap.dev", role: "Owner" },
  { initials: "HP", name: "Huy Pham", email: "huy@codemap.dev", role: "Admin" },
  { initials: "TN", name: "Trinh Ngo", email: "trinh@codemap.dev", role: "Member" },
  { initials: "MD", name: "Minh Do", email: "minh@codemap.dev", role: "Member" },
];

function TeamSection() {
  return <>
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Members</CardTitle>
          <CardDescription>People in your CodeMap workspace. Invite by email — they'll get a sign-in link.</CardDescription>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input placeholder="teammate@example.com" style={{ width: 260 }} />
          <Button size="sm">Invite</Button>
        </div>
      </CardHeader>
      <CardContent style={{ paddingTop: 0 }}>
        {MEMBERS.map((m, i) => (
          <div key={m.email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < MEMBERS.length - 1 ? "1px solid var(--border)" : "none" }}>
            <Avatar initials={m.initials} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{m.email}</div>
            </div>
            <Badge variant={m.role === "Owner" ? "default" : "secondary"}>{m.role}</Badge>
            <Button variant="ghost" size="icon-sm"><Icon name="more-horizontal" size={14} /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  </>;
}

function BillingSection() {
  return <>
    <Card>
      <CardHeader><div><CardTitle>Plan</CardTitle><CardDescription>You're on the Pro plan, billed monthly.</CardDescription></div><Button variant="outline" size="sm">Change plan</Button></CardHeader>
      <CardContent>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <Stat label="Plan" value={<Badge>Pro</Badge>} />
          <Stat label="Seats" value={<span style={{ fontFamily: "var(--font-mono)" }}>4 / 10</span>} />
          <Stat label="Renews" value={<span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>May 25, 2026</span>} />
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><div><CardTitle>Payment method</CardTitle><CardDescription>Charged on the 25th of each month.</CardDescription></div><Button variant="outline" size="sm">Update</Button></CardHeader>
      <CardContent>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 28, background: "var(--secondary)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>VISA</div>
          <div>
            <div style={{ fontSize: 14, fontFamily: "var(--font-mono)" }}>•••• 4242</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Expires 09/27</div>
          </div>
        </div>
      </CardContent>
    </Card>
  </>;
}

Object.assign(window, { Settings });
