import Link from "next/link";
import type { ModuleDefinition } from "@/lib/product";

export function ModulePage({ module }: { module: ModuleDefinition }) {
  return (
    <div className="module-page">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">{module.eyebrow}</p>
          <h1>{module.title}</h1>
          <p className="hero-copy">{module.description}</p>
        </div>
        <div className="availability-card" aria-label="Integration status">
          <span className="status-dot" />
          <div>
            <strong>Verification required</strong>
            <p>Live integration unavailable</p>
          </div>
        </div>
      </section>

      <section className="capability-section" aria-labelledby="capability-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FOUNDATION CAPABILITIES</p>
            <h2 id="capability-heading">Designed into one shared system</h2>
          </div>
          <span className="stage-badge">Foundation stage</span>
        </div>
        <div className="capability-grid">
          {module.capabilities.map((capability, index) => (
            <article className="metal-card" key={capability}>
              <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{capability}</h3>
              <p>Interface foundation ready. Authenticated provider behavior is not yet claimed.</p>
            </article>
          ))}
        </div>
      </section>

      <aside className="boundary-note">
        <span>BOUNDARY</span>
        <p>{module.boundary}</p>
      </aside>

      <div className="route-actions">
        <Link className="gold-button" href="/finished">
          View completion center
        </Link>
        <Link className="text-link" href="/settings">
          Review connection status
        </Link>
      </div>
    </div>
  );
}
