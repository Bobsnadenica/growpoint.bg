import { useState } from "react";
import { Link } from "react-router-dom";
import PageScene from "../layout/PageScene";

const faqItems = [
  {
    question: "Какво получават потребителите безплатно?",
    answer:
      "Потребителите използват CareerLane без платено членство на този етап. Те могат да създадат профил, да добавят основна информация и CV, да разглеждат активните консултанти и ментори и да заявяват консултации."
  },
  {
    question: "Могат ли консултантите да използват платформата безплатно?",
    answer:
      "Да. Консултантите и менторите могат да създадат публичен профил, който да бъде откриваем, отваряем и споделяем, без да е нужна допълнителна активация в текущата версия."
  },
  {
    question: "Показват ли се публично консултантските тарифи?",
    answer:
      "Не. В текущата публична версия акцентът е върху профила, експертизата и свободните слотове, а не върху видими тарифи."
  },
  {
    question: "Как работи регистрацията и потвърждението?",
    answer:
      "Регистрацията е организирана като един ясен поток с директен достъп до профила след създаването му. Потвърждението е част от този процес и не изисква отделен бутон на входната страница."
  },
  {
    question: "Има ли forgot password процес?",
    answer:
      "Да. На страницата за вход има отделен поток за забравена парола с изпращане на код и въвеждане на нова парола."
  },
  {
    question: "Какви документи могат да се пазят в профила?",
    answer:
      "Профилът започва с основен CV документ и ключова информация за професионалния контекст. Структурата е подготвена да се разширява с дипломи, портфолио и допълнителни материали с развитието на услугата."
  },
  {
    question: "Как се заявява рекламна позиция?",
    answer:
      "Партньорите могат да използват рекламната зона и страницата за контакти, където са описани каналите за партньорски и рекламни заявки."
  },
  {
    question: "Гарантира ли платформата наемане или кариерен резултат?",
    answer:
      "Не. CareerLane предоставя среда за професионално позициониране и консултации, но не гарантира конкретен резултат при кандидатстване, интервю или наемане."
  }
] as const;

export default function FaqPage() {
  const [openQuestion, setOpenQuestion] = useState<string | null>(faqItems[0]?.question ?? null);

  return (
    <PageScene tone="support" pageKey="faq">
      <section className="hero hero--centered">
        <div className="container">
          <div className="page-intro">
            <p className="eyebrow">FAQ</p>
            <h1>Отговори на най-честите въпроси.</h1>
            <p className="hero__lede">
              Бърза ориентация за нови потребители, консултанти и партньори — без да
              търсиш информацията в отделни секции.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container faq-layout">
          <div className="faq-list">
          {faqItems.map((item) => {
            const isOpen = openQuestion === item.question;

            return (
              <details
                className="faq-item"
                key={item.question}
                open={isOpen}
                onToggle={(event) => {
                  const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
                  if (nextOpen) {
                    setOpenQuestion(item.question);
                  } else if (isOpen) {
                    setOpenQuestion(null);
                  }
                }}
              >
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            );
          })}
          </div>

          <aside className="faq-aside">
            <article className="panel">
              <p className="eyebrow">Не намираш отговор?</p>
              <h2>Свържи се с нас</h2>
              <p>
                За въпроси извън FAQ — използвай страницата за контакти. Отговаряме до
                1 работен ден.
              </p>
              <Link className="primary-button" to="/contact">
                Към контактите
              </Link>
            </article>
            <article className="panel">
              <p className="eyebrow">Правни детайли</p>
              <h2>Условия и поверителност</h2>
              <p>
                За условията за ползване, обработката на данни и политиката за
                поверителност виж правната страница.
              </p>
              <Link className="ghost-button" to="/legal">
                Към правната страница
              </Link>
            </article>
          </aside>
        </div>
      </section>
    </PageScene>
  );
}
