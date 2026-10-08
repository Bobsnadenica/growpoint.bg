import { Link } from "react-router-dom";
import { personaPresets } from "../../lib/personas";
import "./HomeDiscovery.css";

const topicGoals: Record<string, string> = {
  "career-leadership": "Подготвям се за следващата си роля.",
  "business-entrepreneurship": "Искам да развия своя бизнес.",
  "ai-technology": "Искам да използвам AI в работата си.",
  "communication-growth": "Искам да общувам по-уверено.",
  finance: "Искам да подредя личните си финанси.",
  "creative-practical": "Искам да развия практическо умение."
};

export function HomeTopics() {
  return (
    <section className="section home-topics" aria-labelledby="home-topics-title">
      <div className="container">
        <header className="home-discovery__header">
          <p className="eyebrow">Започни от своята цел</p>
          <h2 id="home-topics-title">В какво искаш да се развиваш?</h2>
          <p>Избери тема, която е важна за теб.</p>
        </header>
        <div className="home-topics__grid">
          {personaPresets.map((topic) => (
            <Link
              className="home-topic-link"
              key={topic.id}
              to={`/users?persona=${encodeURIComponent(topic.id)}`}
            >
              <span className="home-topic-link__code" aria-hidden="true">{topic.code}</span>
              <span className="home-topic-link__arrow" aria-hidden="true">↗</span>
              <span className="home-topic-link__copy">
                <strong>{topic.name}</strong>
                <span>{topicGoals[topic.id] || topic.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomeGuide() {
  return (
    <section className="section home-guide" id="how-it-works" aria-labelledby="home-guide-title">
      <div className="container">
        <header className="home-discovery__header">
          <p className="eyebrow">Как работи</p>
          <h2 id="home-guide-title">От избора до първия разговор.</h2>
        </header>
        <ol className="home-guide__steps" role="list">
          <li>
            <span className="home-guide__number" aria-hidden="true">01</span>
            <h3>Разгледай профилите</h3>
            <p>Сравни опита, темите и условията на експертите.</p>
          </li>
          <li>
            <span className="home-guide__number" aria-hidden="true">02</span>
            <h3>Избери свободен час</h3>
            <p>Добави накратко с какво искаш помощ.</p>
          </li>
          <li>
            <span className="home-guide__number" aria-hidden="true">03</span>
            <h3>Изпрати заявка</h3>
            <p>Следи потвърждението и разговорите от таблото си.</p>
          </li>
        </ol>
        <div className="home-guide__questions" aria-label="Преди да започнеш">
          <details>
            <summary>Трябва ли ми профил, за да разглеждам?</summary>
            <p>
              Не. Можеш да разглеждаш публичните профили без регистрация.
              За да изпратиш заявка за среща, трябва да влезеш в своя профил.
            </p>
          </details>
          <details>
            <summary>Безплатно ли е?</summary>
            <p>
              Клиентският профил е без членска такса. Условията, цената и
              продължителността на сесиите са в профила на всеки експерт.
            </p>
          </details>
          <details>
            <summary>Как се включвам като експерт?</summary>
            <p>
              В момента консултанти и ментори се включват с покана от екипа на
              GrowPoint. Свържи се с нас и ни разкажи за своя опит.
            </p>
          </details>
        </div>
        <div className="home-guide__expert">
          <p>Имаш опит, който може да помогне на някого?</p>
          <Link to="/contact">
            Свържи се с екипа <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
