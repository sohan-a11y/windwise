import { useIsFetching } from "@tanstack/react-query";
import { useMeta } from "./hooks";
import { useRoute } from "./lib/route";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ErrorPanel, LoadingPage } from "./components/ui";
import { DeskPage } from "./pages/DeskPage";
import { AccuracyPage } from "./pages/AccuracyPage";
import { SnapshotsPage } from "./pages/SnapshotsPage";
import { MethodPage } from "./pages/MethodPage";

export default function App() {
  const { route, navigate } = useRoute();
  const meta = useMeta();
  const fetching = useIsFetching();

  return (
    <div className="relative min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
      >
        Skip to content
      </a>

      {fetching > 0 ? (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-teal-100">
          <div className="h-full w-full animate-pulse rounded-full bg-teal-500/70" />
        </div>
      ) : null}

      <Header view={route.view} onNavigate={(view) => navigate({ view })} />

      <div id="main" className="relative">
        {meta.isError ? (
          <ErrorPanel
            title="Windwise could not reach its data"
            message={
              meta.error instanceof Error
                ? `${meta.error.message}. If you are running locally, confirm the API is on port 8000.`
                : "The metadata endpoint did not respond."
            }
            onRetry={() => void meta.refetch()}
          />
        ) : !meta.data ? (
          <LoadingPage label="Verifying the Elexon snapshot" />
        ) : route.view === "desk" ? (
          <div key="desk" className="animate-rise">
            <DeskPage meta={meta.data} route={route} navigate={navigate} />
          </div>
        ) : route.view === "accuracy" ? (
          <div key="accuracy" className="animate-rise">
            <AccuracyPage meta={meta.data} route={route} navigate={navigate} />
          </div>
        ) : route.view === "snapshots" ? (
          <div key="snapshots" className="animate-rise">
            <SnapshotsPage meta={meta.data} route={route} navigate={navigate} />
          </div>
        ) : (
          <div key="method" className="animate-rise">
            <MethodPage meta={meta.data} route={route} navigate={navigate} />
          </div>
        )}
      </div>

      <Footer onNavigate={(view) => navigate({ view })} />
    </div>
  );
}
