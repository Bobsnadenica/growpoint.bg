import { useState } from "react";
import { Link } from "react-router-dom";
import type { ConsultantProfile } from "../../lib/types";
import { resolvePublicUrl } from "../../lib/url";

export default function SpotlightShowcase({ profiles }: { profiles: ConsultantProfile[] }) {
  const spotlight = profiles.filter(profile => profile.packageTier === "spotlight");
  if (!spotlight.length) return null;
  return <section className="section section--tight" aria-label="Spotlight експерти">
    <div className="container spotlight-showcase">
      {spotlight.map(profile => <SpotlightCard profile={profile} key={profile.consultantId} />)}
    </div>
  </section>;
}

function SpotlightCard({ profile }: { profile: ConsultantProfile }) {
  const [failedAvatar, setFailedAvatar] = useState("");
  const [failedCover, setFailedCover] = useState("");
  const avatarUrl = resolvePublicUrl(profile.avatarUrl);
  const coverUrl = resolvePublicUrl(profile.heroUrl);
  const hasAvatar = Boolean(avatarUrl && avatarUrl !== failedAvatar);
  const hasCover = Boolean(coverUrl && coverUrl !== failedCover);
  const topics = Array.from(new Set(profile.specializations || [])).slice(0, 3);

  return <article className="spotlight-showcase__card">
    <div className={`spotlight-showcase__visual${hasCover ? " spotlight-showcase__visual--covered" : ""}`}>
      {hasCover ? <img className="spotlight-showcase__cover" src={coverUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedCover(coverUrl)} /> : null}
      {hasAvatar ? (
        <img className="spotlight-showcase__portrait" src={avatarUrl} alt={profile.name} loading="lazy" decoding="async" onError={() => setFailedAvatar(avatarUrl)} />
      ) : !hasCover ? (
        <span className="spotlight-showcase__initials" aria-hidden="true">
          {profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("")}
        </span>
      ) : null}
    </div>
    <div className="spotlight-showcase__copy">
      <span className="plan-pill">Spotlight · представен експерт</span>
      <h2>{profile.name}</h2>
      <p>{profile.headline || profile.bio.slice(0, 180)}</p>
      {topics.length ? <ul className="spotlight-showcase__topics" aria-label="Теми на профила">
        {topics.map(topic => <li key={topic}>{topic}</li>)}
      </ul> : null}
      <Link className="primary-button" to={`/consultants/${encodeURIComponent(profile.slug)}`}>Разгледай профила <span aria-hidden="true">→</span></Link>
    </div>
  </article>;
}
