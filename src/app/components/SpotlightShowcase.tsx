import { Link } from "react-router-dom";
import type { ConsultantProfile } from "../../lib/types";
import { resolvePublicUrl } from "../../lib/url";

export default function SpotlightShowcase({ profiles }: { profiles: ConsultantProfile[] }) {
  const spotlight = profiles.filter(profile => profile.packageTier === "spotlight");
  if (!spotlight.length) return null;
  return <section className="section section--tight" aria-label="Spotlight експерти">
    <div className="container spotlight-showcase">
      {spotlight.map(profile => <article className="spotlight-showcase__card" key={profile.consultantId}>
        {resolvePublicUrl(profile.heroUrl) ? <img className="spotlight-showcase__cover" src={resolvePublicUrl(profile.heroUrl)} alt="" loading="lazy" /> : null}
        <div className="spotlight-showcase__copy">
          <span className="plan-pill">Spotlight · представен експерт</span>
          <h2>{profile.name}</h2>
          <p>{profile.headline || profile.bio.slice(0, 180)}</p>
          <Link className="primary-button" to={`/consultants/${encodeURIComponent(profile.slug)}`}>Разгледай профила</Link>
        </div>
      </article>)}
    </div>
  </section>;
}
