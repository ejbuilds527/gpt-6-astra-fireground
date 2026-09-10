import { SurfacePage } from "@/components/SurfacePage";
import LayMap from "@/components/LayMap";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <SurfacePage role="staging">
      <div className="grid">
        <section className="card"><h2>The closure you must not enter</h2><LayMap/></section>
      </div>
    </SurfacePage>
  );
}
