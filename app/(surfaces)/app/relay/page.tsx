import { SurfacePage } from "@/components/SurfacePage";
import LayMap from "@/components/LayMap";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <SurfacePage role="relay">
      <div className="grid">
        <section className="card"><h2>The lay · on the map</h2><LayMap/></section>
      </div>
    </SurfacePage>
  );
}
