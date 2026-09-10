import { SurfacePage } from "@/components/SurfacePage";
import ShuttleMap from "@/components/ShuttleMap";

export const dynamic = "force-dynamic";

/** The map mounts HERE, on the route that actually serves /app/shuttle.
 * A static segment beats the dynamic app/app/[role]/page.tsx for this URL. */
export default function Page() {
  return <>
    <SurfacePage role="shuttle"/>
    <main className="wrap">
      <section className="card"><h2>The tanker shuttle</h2><ShuttleMap/></section>
    </main>
  </>;
}
