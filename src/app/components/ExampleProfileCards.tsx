import profiles from "./example-profiles.json";

// Presentation fixtures only: never create Cognito/DynamoDB identities or pass
// these records to the real profile, search, booking, or statistics APIs.
export default function ExampleProfileCards({ count = 3, category, query = "", city = "", kind = "all" }: { count?: number; category?: string; query?: string; city?: string; kind?: string }) {
  const normalized = query.trim().toLocaleLowerCase("bg");
  const matching = profiles.filter((profile) => (!category || profile.category === category) && (kind === "all" || profile.kind === kind) && profile.city.toLocaleLowerCase("bg").includes(city.trim().toLocaleLowerCase("bg")) && (!normalized || [profile.name, profile.headline, profile.description, profile.categoryLabel, ...profile.topics].join(" ").toLocaleLowerCase("bg").includes(normalized)));
  return <>{matching.slice(0, Math.max(0, Math.min(profiles.length, count))).map((profile) => (
    <article className="consultant-card example-profile" key={profile.id} aria-label={`${profile.name} — Example / Пример`}>
      <div className="consultant-card__body">
        <div className="example-profile__portrait"><img src={profile.photo} alt={`AI портрет на измислен човек — ${profile.name}`} width="720" height="720" loading="lazy" /></div>
        <div className="chip-row"><span className="example-profile__badge">Example / Пример</span><span className="plan-pill">{profile.role}</span></div>
        <div className="consultant-card__identity"><h3>{profile.name}</h3><p>{profile.headline}</p></div>
        <p className="consultant-card__summary">{profile.description}</p>
        <div className="chip-row">{profile.topics.map((topic) => <span className="plan-pill" key={topic}>{topic}</span>)}</div>
        <ul className="consultant-card__meta"><li>{profile.city}</li><li>{profile.duration}</li><li>Онлайн</li></ul>
        <div className="consultant-card__footer"><strong>{profile.price}</strong><span>Примерна цена</span></div>
        <p className="form-note">Измислен профил · AI портрет · без резервации</p>
        <a className="ghost-button" href={`/examples/${profile.id}`}>Разгледай примерния профил →</a>
      </div>
    </article>
  ))}</>;
}
