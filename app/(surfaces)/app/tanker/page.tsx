import { SurfacePage } from "@/components/SurfacePage";
import ShuttleMap from "@/components/ShuttleMap";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <SurfacePage role="tanker">
      <div className="grid">
        <section className="card"><h2>The tanker shuttle</h2><ShuttleMap loadedMin={0.9} emptyMin={0.8}/></section>
      </div>
    </SurfacePage>
  );
}
