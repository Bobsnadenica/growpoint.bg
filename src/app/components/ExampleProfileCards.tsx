import profiles from "./example-profiles.json";

// Presentation fixtures only: never create Cognito/DynamoDB identities or pass
// these records to the real profile, search, booking, or statistics APIs.
export default function ExampleProfileCards({ count = 3 }: { count?: number }) {
  return <>{profiles.slice(0, Math.max(0, Math.min(3, count))).map((profile) => (
    <article className="consultant-card example-profile" key={profile.id} aria-label={`${profile.name} — Example / Пример`}>
      <div className="consultant-card__body">
        <div className="example-profile__portrait" aria-hidden="true">
          <svg viewBox="0 0 240 150" focusable="false">
            <path d="M20 120 Q70 20 120 85 T225 35" fill="none" stroke="currentColor" strokeWidth="2" opacity=".3" />
            <circle cx="120" cy="55" r="27" fill="currentColor" opacity=".5" />
            <path d="M62 150v-13a58 58 0 0 1 116 0v13" fill="currentColor" opacity=".7" />
          </svg>
          <span>{profile.initials}</span>
        </div>
        <div className="chip-row"><span className="example-profile__badge">Example / Пример</span><span className="plan-pill">{profile.role}</span></div>
        <div className="consultant-card__identity"><h3>{profile.name}</h3><p>{profile.headline}</p></div>
        <p className="consultant-card__summary">{profile.description}</p>
        <div className="chip-row">{profile.topics.map((topic) => <span className="plan-pill" key={topic}>{topic}</span>)}</div>
        <ul className="consultant-card__meta"><li>{profile.city}</li><li>{profile.duration}</li><li>Онлайн</li></ul>
        <div className="consultant-card__footer"><strong>{profile.price}</strong><span>Примерна цена</span></div>
        <details className="example-profile__details"><summary>За този примерен профил</summary><p>Измислен профил само за представяне на платформата. Не е реален експерт и не приема резервации. Името, темите и цената са илюстративни.</p></details>
      </div>
    </article>
  ))}</>;
}
