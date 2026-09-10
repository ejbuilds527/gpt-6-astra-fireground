import { SurfacePage } from "@/components/SurfacePage";
import LayMap from "@/components/LayMap";
import ShuttleMap from "@/components/ShuttleMap";

export const dynamic = "force-dynamic";

/** The maps mount HERE, on the route that actually serves /app/command.
 * app/app/[role]/page.tsx also mounts them, but a static segment beats a
 * dynamic one in the app router, so that file never renders for this URL. */
export default function Page() {
  // Passed as children, not imported: Surface is a client component, and these read the key on the server.
  return <SurfacePage role="command">
    <div className="grid">
      <section className="card"><h2>The lay · on the map</h2><LayMap/></section>
      <section className="card"><h2>The tanker shuttle</h2><ShuttleMap/></section>
    </div>
  </SurfacePage>;
}
