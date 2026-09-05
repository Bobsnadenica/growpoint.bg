import { Link, useParams } from "react-router-dom";
import profiles from "../components/example-profiles.json";
import PageScene from "../layout/PageScene";

export default function ExampleProfilePage() {
  const { id } = useParams();
  const profile = profiles.find((item) => item.id === id);
  if (!profile) return <section className="container section"><h1>Примерният профил не е намерен.</h1><Link to="/users">Към каталога</Link></section>;
  return <PageScene tone="support" pageKey={`example-${profile.id}`}>
    <section className="section"><div className="container">
      <Link className="ghost-button" to={`/users?persona=${profile.category}`}>← {profile.categoryLabel}</Link>
      <p className="panel example-disclosure" role="note"><strong>Example / Пример</strong> — измислен човек и илюстративна биография с AI-генериран портрет. Това не е реален експерт, няма потвърдени квалификации и не приема резервации.</p>
      <div className="example-detail-layout">
        <aside className="panel example-detail-sidebar"><img src={profile.photo} alt={`AI портрет — ${profile.name}, измислен профил`} width="720" height="720" /><span className="example-profile__badge">Example / Пример</span><h2>{profile.role}</h2><p>{profile.city} · Онлайн · {profile.duration}</p><strong>{profile.price} · примерна цена</strong><p>{profile.languages.join(" · ")}</p><p className="form-note">Резервации и плащания не са достъпни за примери.</p><Link className="primary-button" to="/users">Разгледай реалните експерти</Link></aside>
        <div className="example-detail-content"><header><p className="eyebrow">{profile.categoryLabel}</p><h1>{profile.name}</h1><p className="hero__lede">{profile.headline}</p></header>
          <section className="panel"><h2>За мен</h2><p>{profile.description}</p><div className="chip-row">{profile.topics.map((topic) => <span className="plan-pill" key={topic}>{topic}</span>)}</div></section>
          <section className="panel"><h2>Примерен опит и образование</h2><p>{profile.experience}.</p><p>Област на обучение: {profile.education}.</p><p className="form-note">Тези данни са измислени за демонстрацията, а не удостоверени професионални качества.</p></section>
          <section className="panel"><h2>За кого е тази сесия</h2><p>{profile.audience}</p><h3>Как протича</h3><ol>{profile.approach.map((step) => <li key={step}>{step}</li>)}</ol></section>
          <section className="panel"><h2>Какво можеш да подготвиш</h2><p>Един конкретен въпрос, кратко описание на ситуацията и целта, която искаш да постигнеш.</p><h3>Примерен резултат от работата</h3><p>{profile.outcomes}</p><p className="form-note">Това е описание на примерен формат, не обещание за резултат.</p></section>
        </div>
      </div>
    </div></section>
  </PageScene>;
}
