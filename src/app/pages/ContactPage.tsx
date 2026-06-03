import { FormEvent, useState } from "react";
import PageScene from "../layout/PageScene";

const contactChannels = [
  {
    title: "Общи въпроси и поддръжка",
    description: "За въпроси по профила, достъпа, регистрацията и използването на платформата.",
    email: "support@careerlane.eu"
  },
  {
    title: "Партньорства и реклама",
    description: "За рекламни позиции, работодателски брандове, академии и други партньорски формати.",
    email: "partners@careerlane.eu"
  },
  {
    title: "Правни и данни",
    description: "За правни запитвания, privacy заявки и административни въпроси, свързани с данни.",
    email: "legal@careerlane.eu"
  }
] as const;

export default function ContactPage() {
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    topic: "support",
    details: ""
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const recipient =
      form.topic === "partnerships"
        ? "partners@careerlane.eu"
        : form.topic === "legal"
          ? "legal@careerlane.eu"
          : "support@careerlane.eu";
    const subject = `[CareerLane] ${
      form.topic === "partnerships"
        ? "Партньорско запитване"
        : form.topic === "legal"
          ? "Правно запитване"
          : "Обща поддръжка"
    }`;
    const body = `Име: ${form.name}\nИмейл: ${form.email}\nТема: ${form.topic}\n\nСъобщение:\n${form.details}`;

    setMessage(
      `Подготвихме съобщение към ${recipient}. Ако имейл клиентът ти не се отвори автоматично, копирай адреса и ни пиши директно.`
    );

    if (typeof window !== "undefined") {
      window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
  }

  return (
    <PageScene tone="company" pageKey="contact">
      <section className="hero hero--centered">
        <div className="container">
          <div className="page-intro">
            <p className="eyebrow">Контакти</p>
            <h1>Свържи се с нас.</h1>
            <p className="hero__lede">
              Общите въпроси, партньорствата и правните запитвания са разделени в ясни
              канали, за да започва разговорът по-лесно. Отговаряме до 1 работен ден.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container contact-grid">
          {contactChannels.map((channel) => (
            <article className="info-card" key={channel.email}>
              <p className="eyebrow">Контактен канал</p>
              <h3>{channel.title}</h3>
              <p>{channel.description}</p>
              <a className="ghost-button" href={`mailto:${channel.email}`}>
                {channel.email}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="section section--alt">
        <div className="container public-layout">
          <form className="panel form-stack" onSubmit={handleSubmit}>
            <p className="eyebrow">Форма за контакт</p>
            <h2>Изпрати запитване</h2>
            <p className="section-caption">
              Формата подготвя имейл към правилния канал според избраната тема.
            </p>

            {message ? <div className="panel panel--success">{message}</div> : null}

            <div className="two-column">
              <label>
                Име
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Име и фамилия"
                  required
                />
              </label>
              <label>
                Имейл
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="name@example.com"
                  required
                />
              </label>
            </div>

            <label>
              Тема
              <select
                value={form.topic}
                onChange={(event) => setForm({ ...form, topic: event.target.value })}
              >
                <option value="support">Обща поддръжка</option>
                <option value="partnerships">Партньорства и реклама</option>
                <option value="legal">Правни и данни</option>
              </select>
            </label>

            <label>
              Съобщение
              <textarea
                rows={6}
                value={form.details}
                onChange={(event) => setForm({ ...form, details: event.target.value })}
                placeholder="Опиши запитването си възможно най-ясно."
                required
              />
            </label>

            <button className="primary-button" type="submit">
              Подготви имейл
            </button>
          </form>

          <aside className="panel page-side-card">
            <p className="eyebrow">Насоки</p>
            <h2>Кога коя тема е правилният избор</h2>
            <ul className="page-list">
              <li>Използвай „Обща поддръжка" за акаунт, достъп, вход и потребителски въпроси.</li>
              <li>Използвай „Партньорства и реклама" за рекламната зона и employer branding формати.</li>
              <li>Използвай „Правни и данни" за privacy заявки, условия и административни въпроси.</li>
            </ul>
          </aside>
        </div>
      </section>
    </PageScene>
  );
}
