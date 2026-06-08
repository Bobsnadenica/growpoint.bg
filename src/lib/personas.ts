import type { ConsultantProfileType } from "./types";

export type PersonaIcon =
  | "document"
  | "leadership"
  | "transition"
  | "product"
  | "data"
  | "communication";

export type PersonaPreset = {
  id: string;
  type: ConsultantProfileType;
  code: string;
  icon: PersonaIcon;
  name: string;
  description: string;
  tags: string[];
};

export const personaPresets: PersonaPreset[] = [
  {
    id: "cv-interview",
    type: "consultant",
    code: "CV",
    icon: "document",
    name: "CV и интервю",
    description:
      "Преглед на CV и LinkedIn и подготовка за конкретно интервю в близките седмици.",
    tags: ["cv", "linkedin", "interview", "интервю", "review", "позициониране"]
  },
  {
    id: "leadership-positioning",
    type: "consultant",
    code: "LP",
    icon: "leadership",
    name: "Leadership позициониране",
    description:
      "Executive CV и подготовка за senior, директорски и management роли.",
    tags: [
      "executive",
      "leadership",
      "management",
      "senior",
      "мениджърски",
      "директор"
    ]
  },
  {
    id: "career-transition",
    type: "consultant",
    code: "КП",
    icon: "transition",
    name: "Кариерна промяна",
    description:
      "Стратегия за смяна на посока, индустрия или ниво и подреждане на план за кандидатстване.",
    tags: ["career", "transition", "промяна", "преход", "switch", "стратегия", "search"]
  },
  {
    id: "product-mentor",
    type: "mentor",
    code: "PM",
    icon: "product",
    name: "Product и стартъпи",
    description:
      "Дългосрочна посока за product, ownership и стартъп роли.",
    tags: ["product", "management", "startup", "growth", "ownership"]
  },
  {
    id: "tech-data-mentor",
    type: "mentor",
    code: "TD",
    icon: "data",
    name: "Tech и Data",
    description:
      "Кариерен растеж в инженерни, аналитични и data роли.",
    tags: ["data", "analytics", "engineering", "tech", "software", "developer", "analyst"]
  },
  {
    id: "soft-skills-mentor",
    type: "mentor",
    code: "СК",
    icon: "communication",
    name: "Увереност и комуникация",
    description:
      "Soft skills, нетуъркинг и подготовка за стресови или презентационни интервюта.",
    tags: [
      "confidence",
      "увереност",
      "soft",
      "skills",
      "anxiety",
      "тревожност",
      "networking",
      "комуникация",
      "presentation"
    ]
  }
];

export function getPersonaById(id: string | null | undefined) {
  if (!id) {
    return null;
  }

  return personaPresets.find((item) => item.id === id) || null;
}
