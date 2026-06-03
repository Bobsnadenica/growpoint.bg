import PageScene from "../layout/PageScene";

const aboutHighlights = [
  {
    value: "Публични профили",
    label: "реални консултанти и ментори с отделна публична страница"
  },
  {
    value: "Ясни роли",
    label: "отделни потоци за потребители, консултанти и партньори"
  },
  {
    value: "Едно табло",
    label: "централно място за профил, документи и предстоящи сесии"
  }
] as const;

const aboutPrinciples = [
  {
    title: "Ясна структура",
    text: "Потребителите трябва да разбират къде се намират, какво могат да направят и каква е следващата полезна стъпка."
  },
  {
    title: "Професионално доверие",
    text: "Профилите, страниците и публичните секции са оформени така, че да изглеждат уверено и сериозно още на първо отваряне."
  },
  {
    title: "Лек процес на работа",
    text: "Регистрацията, входът, профилът и достъпът до кариерни консултанти са подредени с минимално триене и без излишни технически детайли."
  }
] as const;

export default function AboutPage() {
  return (
    <PageScene tone="company" pageKey="about">
      <section className="hero hero--centered">
        <div className="container">
          <div className="page-intro">
            <p className="eyebrow">За нас</p>
            <h1>Професионална среда за по-ясни кариерни решения.</h1>
            <p className="hero__lede">
              CareerLane свързва професионалисти, консултанти и партньори в подреден и
              представителен онлайн формат. Целта ни е хората да намират правилната
              подкрепа по-лесно — от едно ясно място.
            </p>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="about-highlights">
            {aboutHighlights.map((item) => (
              <article key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading section-heading--centered">
            <p className="eyebrow">Принципи</p>
            <h2>Как е устроена платформата.</h2>
          </div>
          <div className="info-grid">
            {aboutPrinciples.map((item) => (
              <article className="info-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PageScene>
  );
}
