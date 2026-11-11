import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { request } from "../../lib/api";
import "./ComingSoon.css";

const connectionPaths = [
  "M-80 650C130 670 150 430 300 450S430 200 600 190",
  "M950-80C910 160 1150 100 1190 340S1410 440 1530 700",
  "M100 900C240 650 430 800 600 660S920 600 1050 820"
];
const connectionNodes = [[110, 615], [300, 450], [465, 260], [1120, 135], [1190, 340], [1350, 470], [255, 765], [600, 660], [795, 650], [1050, 820]];

export default function ComingSoon() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const firstName = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const oldTitle = document.title;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const oldRobots = robots?.content;
    document.title = "GrowPoint · Очаквайте скоро";
    if (robots) robots.content = "noindex,follow";
    return () => { document.title = oldTitle; if (robots && oldRobots !== undefined) robots.content = oldRobots; };
  }, []);
  useEffect(() => {
    if (open) {
      (success ? result.current : firstName.current)?.focus({ preventScroll: true });
      document.getElementById("early-registration")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
  }, [open, success]);
  function close() { setOpen(false); setError(""); trigger.current?.focus({ preventScroll: true }); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await request("/preregistrations", { method: "POST", body: JSON.stringify({
        firstName: form.get("firstName"), lastName: form.get("lastName"), audience: form.get("audience"),
        email: form.get("email"), phone: form.get("phone"), comment: form.get("comment"),
        consent: form.get("consent") === "on", website: form.get("website")
      }) });
      setSuccess(true);
    } catch (value) { setError(value instanceof TypeError ? "Не успяхме да изпратим заявката. Провери връзката си и опитай отново — въведеното е запазено във формата." : value instanceof Error ? value.message : "Заявката не беше записана. Опитай отново."); }
    finally { setBusy(false); }
  }
  return (
    <div className={`coming-soon${open ? " coming-soon--form-open" : ""}`}>
      <div className="coming-soon__backdrop" aria-hidden="true">
        <div className="coming-soon__ghost-nav"><img src="/assets/logo/logo_white.png" alt="" /><span>Ментори</span><span>Възможности</span><span>Твоят профил</span></div>
        <div className="coming-soon__ghost-hero"><span>Твоят следващ ход.</span><div /><div /></div>
        <div className="coming-soon__ghost-cards">{["Развивай се", "Открий посоката", "Срещни своите хора"].map((text, index) => <div key={text}><span className={`coming-soon__ghost-avatar coming-soon__ghost-avatar--${index}`} /><strong>{text}</strong><i /><i /></div>)}</div>
      </div>
      <div className="coming-soon__glow coming-soon__glow--one" aria-hidden="true" />
      <div className="coming-soon__glow coming-soon__glow--two" aria-hidden="true" />
      <svg className="coming-soon__network" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        {connectionPaths.map((d, index) => <g key={d}>
          <path className="coming-soon__connection" d={d} />
          <path className="coming-soon__signal" d={d} pathLength="100" style={{ animationDelay: `${index * -5}s` }} />
        </g>)}
        {connectionNodes.map(([cx, cy], index) => <circle className="coming-soon__node" key={index} cx={cx} cy={cy} r={index % 3 === 0 ? 3.5 : 2} style={{ animationDelay: `${index * -.7}s` }} />)}
      </svg>
      <header className="coming-soon__header">
        <Link to="/" aria-label="GrowPoint начало"><img src="/assets/logo/logo_white.png" alt="GrowPoint" width="174" height="48" /></Link>
        <span className="coming-soon__status"><i />Скоро сме тук</span>
      </header>
      <main id="coming-soon-main" className="coming-soon__main">
        <div className="coming-soon__intro">
          <p className="coming-soon__eyebrow">Всяка следваща стъпка започва с човек.</p>
          <h1>Твоят потенциал.<br /><span>Нови възможности.</span></h1>
          <p className="coming-soon__lede">Ментори, идеи и смислени срещи.<br />Подготвяме мястото за следващата ти стъпка.</p>
        </div>
        <div className="coming-soon__tape" aria-label="Очаквайте скоро">
          <div aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <span key={i}>ОЧАКВАЙТЕ СКОРО <b>✳</b></span>)}</div>
        </div>
        <div className="coming-soon__invitation">
          <p>Бъди сред първите, които ще открият GrowPoint.</p>
          <button ref={trigger} className="coming-soon__cta" type="button" disabled={busy} aria-expanded={open} aria-controls="early-registration" onClick={() => setOpen(value => !value)}>Регистрирайте се предварително <span aria-hidden="true">↗</span></button>
          <span className="coming-soon__micro">Без ангажимент. Само една нова възможност.</span>
        </div>
        <section id="early-registration" hidden={!open} className="coming-soon__form-card" aria-labelledby="registration-title" onKeyDown={event => { if (event.key === "Escape" && !busy) close(); }}>
          <button className="coming-soon__close" type="button" aria-label="Затвори формата" disabled={busy} onClick={close}>×</button>
          {success ? <div ref={result} tabIndex={-1} className="coming-soon__success" role="status"><span aria-hidden="true">✓</span><h2 id="registration-title">В списъка си.</h2><p>Благодарим за интереса! Ще се свържем с теб за старта на GrowPoint.</p><p className="coming-soon__micro">Това е заявка за интерес, а не създаден потребителски профил.</p></div> : <>
            <p className="coming-soon__eyebrow">Първата стъпка е твоя</p>
            <h2 id="registration-title">Да се запознаем.</h2>
            <p className="coming-soon__form-lede">Остави ни контакт. Ще ти пишем, когато сме готови.<span id="registration-hint" className="coming-soon__field-hint">Полетата без „по желание“ са задължителни.</span></p>
            <form onSubmit={submit} aria-busy={busy} aria-describedby="registration-hint">
              <fieldset disabled={busy} className="coming-soon__fields">
                <legend className="sr-only">Данни за предварителна регистрация</legend>
                <div className="coming-soon__row"><label>Име<input ref={firstName} name="firstName" autoComplete="given-name" required maxLength={80} /></label><label>Фамилия<input name="lastName" autoComplete="family-name" required maxLength={80} /></label></div>
                <fieldset className="coming-soon__roles"><legend>Как искаш да се включиш?</legend><label><input type="radio" name="audience" value="client" required /><span>Потребител<small>Търся посока и подкрепа</small></span></label><label><input type="radio" name="audience" value="mentor" required /><span>Ментор<small>Искам да споделям опит</small></span></label></fieldset>
                <label>Имейл адрес<input type="email" name="email" autoComplete="email" required maxLength={254} inputMode="email" /></label>
                <label>Телефон <span className="coming-soon__optional">по желание</span><input type="tel" name="phone" autoComplete="tel" maxLength={30} /></label>
                <label>Кратък коментар <span className="coming-soon__optional">по желание</span><textarea name="comment" rows={3} maxLength={1000} placeholder="Какво би искал/а да откриеш в GrowPoint?" /></label>
                <label className="coming-soon__honeypot" aria-hidden="true">Уебсайт<input name="website" tabIndex={-1} autoComplete="off" /></label>
                <label className="coming-soon__consent"><input name="consent" type="checkbox" required /><span>Съгласен/на съм GrowPoint да използва тези данни, за да се свърже с мен относно старта.</span></label>
                <details className="coming-soon__privacy"><summary>Как пазим данните ти</summary><p>Администратор: РЪШ ФОР ПРАКТИС ЕООД, ЕИК 207927631. Използваме данните само за предварителната регистрация и връзка относно старта. Телефонът и коментарът са по желание. Съхраняваме заявката до 180 дни; не създаваме акаунт и не те абонираме за реклами. Можеш да оттеглиш съгласието си и да поискаш изтриване на <a href="mailto:contactus@growpoint.bg">contactus@growpoint.bg</a>. <Link to="/privacy" target="_blank" rel="noopener">Политика за поверителност</Link>.</p></details>
                {error && <p className="coming-soon__error" role="alert">{error}</p>}
                <button className="coming-soon__cta coming-soon__cta--submit" type="submit">{busy ? "Записваме…" : "Запазете ми място"}<span aria-hidden="true">{busy ? "…" : "→"}</span></button>
              </fieldset>
            </form>
          </>}
        </section>
      </main>
      <footer className="coming-soon__footer">
        <span>© {new Date().getFullYear()} GrowPoint</span>
        <Link to="/privacy">Поверителност</Link>
      </footer>
    </div>
  );
}
