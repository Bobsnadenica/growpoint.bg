import type { ConsultantProfileType } from "./types";

export type PersonaIcon =
  | "document"
  | "leadership"
  | "transition"
  | "product"
  | "data"
  | "communication"
  | "health"
  | "finance"
  | "creative";

export type PersonaPreset = {
  id: string;
  // Optional: the new области span both consultants and mentors. When unset the
  // directory does not narrow by profile type.
  type?: ConsultantProfileType;
  code: string;
  icon: PersonaIcon;
  name: string;
  description: string;
  tags: string[];
};

// Области per the 2026-06 designer/tester copy document. The first 3 tags are
// displayed as chips on the card (exact copy from the document); the rest are
// lowercase matching keywords used for ranking.
export const personaPresets: PersonaPreset[] = [
  {
    id: "career-leadership",
    code: "КЛ",
    icon: "leadership",
    name: "Кариера и лидерство",
    description:
      "Развий кариерата си, подготви се за следващата роля и усъвършенствай своите лидерски умения.",
    tags: [
      "Кариера",
      "Лидерство",
      "Интервюта",
      "career",
      "leadership",
      "interview",
      "cv",
      "linkedin",
      "management",
      "executive",
      "мениджърски"
    ]
  },
  {
    id: "business-entrepreneurship",
    code: "БП",
    icon: "product",
    name: "Бизнес и предприемачество",
    description:
      "Стартирай, развивай и мащабирай своя бизнес с помощта на хора, които вече са извървели този път.",
    tags: [
      "Бизнес",
      "Продажби",
      "Растеж",
      "business",
      "startup",
      "growth",
      "sales",
      "предприемачество",
      "product"
    ]
  },
  {
    id: "ai-technology",
    code: "AI",
    icon: "data",
    name: "AI и технологии",
    description:
      "Овладей новите технологии, изкуствения интелект и дигиталните инструменти, които променят начина на работа.",
    tags: [
      "AI",
      "Технологии",
      "Данни",
      "ai",
      "tech",
      "data",
      "analytics",
      "engineering",
      "software",
      "developer",
      "технологии"
    ]
  },
  {
    id: "communication-growth",
    code: "КР",
    icon: "communication",
    name: "Комуникация и личностно развитие",
    description:
      "Изгради увереност, подобри комуникацията си и развий уменията, които отварят нови възможности.",
    tags: [
      "Комуникация",
      "Увереност",
      "Презентации",
      "communication",
      "confidence",
      "presentation",
      "soft",
      "skills",
      "networking",
      "увереност"
    ]
  },
  {
    id: "health-sport",
    code: "ЗС",
    icon: "health",
    name: "Здраве и спорт",
    description:
      "Постигни целите си чрез правилен подход към тренировките, храненето и изграждането на устойчиви навици.",
    tags: [
      "Фитнес",
      "Хранене",
      "Навици",
      "fitness",
      "health",
      "nutrition",
      "habits",
      "sport",
      "тренировки",
      "здраве"
    ]
  },
  {
    id: "finance",
    code: "ФИ",
    icon: "finance",
    name: "Финанси",
    description:
      "Научи как по-добре да управляваш парите си, да планираш бъдещето си и да вземаш информирани финансови решения.",
    tags: [
      "Инвестиции",
      "Бюджет",
      "Финанси",
      "finance",
      "investing",
      "budget",
      "money",
      "финанси",
      "инвестиции"
    ]
  },
  {
    id: "creative-practical",
    code: "ТУ",
    icon: "creative",
    name: "Творчески и практически умения",
    description:
      "Учи се от практици в области като фризьорство, грим, фотография, дизайн и други приложими умения.",
    tags: [
      "Дизайн",
      "Фотография",
      "Фризьорство",
      "design",
      "photography",
      "creative",
      "грим",
      "фризьорство",
      "умения"
    ]
  }
];

export function getPersonaById(id: string | null | undefined) {
  if (!id) {
    return null;
  }

  return personaPresets.find((item) => item.id === id) || null;
}
