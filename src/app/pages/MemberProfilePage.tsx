import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { applyMemberProfileSeo } from "../../lib/seo";
import type { PublicUserProfile } from "../../lib/types";
import PageScene from "../layout/PageScene";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "GP"
  );
}

export default function MemberProfilePage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [member, setMember] = useState<PublicUserProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    api
      .getPublicUser(id)
      .then((value) => {
        if (!mounted) return;
        setMember(value);
        setStatus("ready");
        applyMemberProfileSeo(value);
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!shareMessage) return;
    const timeout = window.setTimeout(() => setShareMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [shareMessage]);

  const isOwnProfile = Boolean(user && member && user.id === member.userId);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/u/${id}` : `/u/${id}`;

  async function shareProfile() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: member?.name || "Профил в GrowPoint",
          text: member?.headline || member?.occupation || "Виж профила ми в GrowPoint.",
          url: shareUrl
        });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Линкът към профила беше копиран.");
        return;
      }
      setShareMessage("Профилният линк е готов за споделяне.");
    } catch {
      setShareMessage("Споделянето беше прекъснато.");
    }
  }

  if (status === "loading") {
    return (
      <PageScene tone="consultant" pageKey="member">
        <section className="section">
          <div className="container">
            <div className="panel">Зареждаме профила...</div>
          </div>
        </section>
      </PageScene>
    );
  }

  if (status === "error" || !member) {
    return (
      <PageScene tone="consultant" pageKey="member">
        <section className="section">
          <div className="container">
            <div className="panel">
              <h1>Профилът не е намерен</h1>
              <p className="form-note">
                Този профил не съществува или линкът е невалиден.
              </p>
              <Link className="primary-button" to="/">
                Към началото
              </Link>
            </div>
          </div>
        </section>
      </PageScene>
    );
  }

  const roleLabel = member.role === "consultant" ? "Консултант / ментор" : "Потребител";
  const hasExpertise =
    member.skills.length ||
    member.interests.length ||
    member.experienceHighlights.length ||
    member.educationHighlights.length;
  const isThinProfile =
    !member.bio && !member.headline && !member.experienceSummary && !hasExpertise;

  return (
    <PageScene tone="consultant" pageKey="member">
      <section className="profile-hero">
        <div className="container profile-stage">
          <article className="profile-stage__main">
            <div className="profile-stage__content">
              {member.avatarUrl ? (
                <img
                  className="profile-stage__avatar"
                  src={member.avatarUrl}
                  alt={member.name}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="profile-stage__avatar member-avatar-fallback" aria-hidden="true">
                  {initials(member.name)}
                </div>
              )}

              <div className="profile-stage__body">
                <div>
                  <p className="eyebrow">{roleLabel}</p>
                  <h1>{member.name}</h1>
                  {member.headline ? (
                    <p className="profile-stage__headline">{member.headline}</p>
                  ) : null}
                  {member.occupation || member.city ? (
                    <p className="profile-stage__headline">
                      {[member.occupation, member.city].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>

                {member.bio ? <p className="profile-stage__summary">{member.bio}</p> : null}

                <div className="profile-actions">
                  {isOwnProfile ? (
                    <Link className="primary-button" to="/dashboard#profile-basics">
                      Редактирай профила
                    </Link>
                  ) : null}
                  <button className="ghost-button" type="button" onClick={shareProfile}>
                    Сподели профила
                  </button>
                  {member.role === "consultant" ? (
                    <Link className="ghost-button" to="/users">
                      Разгледай консултантите
                    </Link>
                  ) : null}
                </div>
                {shareMessage ? (
                  <div className="panel panel--success">{shareMessage}</div>
                ) : null}
                {isOwnProfile && isThinProfile ? (
                  <div className="panel panel--subtle">
                    <strong>Профилът ти е почти празен.</strong>
                    <p>
                      Допълни заглавие, описание и умения от таблото, за да изглежда
                      страницата ти завършена, когато я споделиш.
                    </p>
                    <Link className="ghost-button" to="/dashboard#profile-basics">
                      Допълни профила си
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      </section>

      {member.experienceSummary || hasExpertise ? (
        <section className="section section--tight">
          <div className="container">
            <div className="panel-stack">
              {member.experienceSummary ? (
                <article className="panel consultant-detail-panel consultant-detail-panel--wide">
                  <h2>Опит</h2>
                  <p>{member.experienceSummary}</p>
                  {member.experienceHighlights.length ? (
                    <ul className="feature-list">
                      {member.experienceHighlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ) : null}

              {hasExpertise ? (
                <article className="panel consultant-detail-panel consultant-detail-panel--wide consultant-expertise">
                  <h2>Експертиза и интереси</h2>
                  {member.skills.length ? (
                    <section className="consultant-expertise__block">
                      <h3>Умения</h3>
                      <div className="chip-row">
                        {member.skills.map((item) => (
                          <span className="chip" key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {member.interests.length ? (
                    <section className="consultant-expertise__block">
                      <h3>Интереси</h3>
                      <div className="chip-row">
                        {member.interests.map((item) => (
                          <span className="chip chip--soft" key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {member.educationHighlights.length ? (
                    <section className="consultant-expertise__block">
                      <h3>Образование</h3>
                      <div className="chip-row">
                        {member.educationHighlights.map((item) => (
                          <span className="chip chip--soft" key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </article>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </PageScene>
  );
}
