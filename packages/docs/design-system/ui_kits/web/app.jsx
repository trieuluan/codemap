// Top-level shell + router. Keeps a tiny client-side state object for navigation.

function App() {
  const [state, setState] = React.useState({ route: "/dashboard", project: null });
  const navigate = next => setState(s => ({ ...s, ...next }));

  const titleFor = (route) => {
    if (route === "/dashboard") return "Overview";
    if (route === "/projects") return "Projects";
    if (route.startsWith("/projects/") && route.endsWith("/map")) return "Code map";
    if (route.startsWith("/projects/")) return "Project";
    if (route === "/dashboard/settings") return "Settings";
    return "CodeMap";
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)" }}>
      <Sidebar activeRoute={state.route} onNavigate={item => navigate({ route: item.route })} />
      <div style={{ paddingLeft: 256 }}>
        <Header title={titleFor(state.route)} />
        <main style={{ padding: 24, maxWidth: 1400 }}>
          {state.route === "/dashboard" && <Dashboard onNavigate={navigate} />}
          {state.route === "/projects" && <Projects onNavigate={navigate} />}
          {state.route.match(/^\/projects\/[^/]+$/) && <ProjectDetail project={state.project} onNavigate={navigate} />}
          {state.route.match(/^\/projects\/[^/]+\/map$/) && <ProjectMap project={state.project} onNavigate={navigate} />}
          {state.route === "/dashboard/settings" && <Settings />}
          {/* Fallbacks for nav items without dedicated screens */}
          {(state.route === "/api" || state.route === "/team" || state.route === "/help") && (
            <Empty
              icon={state.route === "/help" ? "help-circle" : state.route === "/team" ? "users" : "code"}
              title={titleFor(state.route) + " coming soon"}
              description="This area exists in the codebase as a placeholder route. The design system mocks it as an empty state to match how the real app currently behaves."
            />
          )}
        </main>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
