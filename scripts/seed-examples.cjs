#!/usr/bin/env node
/**
 * Seeds the consultants table with 10 realistic-looking example profiles
 * marked as isExample: true. Runs only once per slug (uses ConditionExpression
 * on slug-claim rows so re-runs are idempotent).
 *
 * Run:
 *   AWS_REGION=eu-west-1 \
 *   CONSULTANTS_TABLE=careerdoc-dev-consultants \
 *   node scripts/seed-examples.cjs
 *
 * Or use the live region/table the Lambda is configured with:
 *   AWS_REGION=eu-west-1 node scripts/seed-examples.cjs
 */
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Reuse the backend's already-installed AWS SDK.
const sdkRoot = path.join(__dirname, "..", "backend", "api", "node_modules");
const { DynamoDBClient } = require(path.join(sdkRoot, "@aws-sdk", "client-dynamodb"));
const {
  DynamoDBDocumentClient,
  TransactWriteCommand
} = require(path.join(sdkRoot, "@aws-sdk", "lib-dynamodb"));

const REGION = process.env.AWS_REGION || "eu-west-1";
const TABLE = process.env.CONSULTANTS_TABLE || "careerdoc-dev-consultants";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const SLUG_CLAIM_PREFIX = "slug-claim#";

// Availability helper — emits ISO-string slots N days out at given hour.
function slotsForDays(daysAhead, hours) {
  const now = new Date();
  const out = [];
  for (const day of daysAhead) {
    for (const hour of hours) {
      const d = new Date(now);
      d.setDate(d.getDate() + day);
      d.setHours(hour, 0, 0, 0);
      out.push(d.toISOString());
    }
  }
  return out;
}

const examples = [
  {
    slug: "elena-petrova-career-leadership",
    name: "Елена Петрова",
    profileType: "consultant",
    headline: "Кариерен консултант за лидерски преходи",
    bio: "Помагам на старши специалисти да направят следващата стъпка — от senior IC към ръководна роля или от мениджмънт към директор. Работим върху видимост, разказ и решения, които спасяват години.",
    experienceSummary: "12 години корпоративен опит в HR и L&D в международни технологични компании, последните 5 — независим консултант.",
    experienceHighlights: [
      "Менторирала 80+ клиенти през преходи към VP/Director роли",
      "Бивш Head of People в SaaS компания (60→320 души)",
      "Сертифициран Hogan и Korn Ferry асесьор"
    ],
    educationHighlights: [
      "MBA — INSEAD (2018)",
      "Магистър по психология — СУ (2011)"
    ],
    city: "София",
    languages: ["Български", "Английски"],
    specializations: ["Лидерство", "Кариерна стратегия", "Изпълнителна готовност"],
    sessionModes: ["Онлайн", "На живо"],
    tags: ["leadership", "executive", "career-pivot"],
    idealFor: ["Senior IC →  Manager", "Manager → Director", "First-time exec"],
    consultationTopics: ["Видимост и личен бранд", "Преговори за пакет", "30/60/90 план"],
    workApproach: "Структуриран процес от 4 сесии: диагностика, разказ, план, изпълнение. Без шаблони.",
    sessionLengthMinutes: 90,
    experienceYears: 12,
    priceBgn: 320,
    featured: true,
    rating: 4.9,
    reviewCount: 47,
    avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg",
    availability: slotsForDays([1, 2, 4, 7, 9], [10, 14, 17])
  },
  {
    slug: "georgi-dimitrov-tech-careers",
    name: "Георги Димитров",
    profileType: "consultant",
    headline: "Tech career coach за софтуерни инженери",
    bio: "Бивш Staff Engineer от Booking.com и Spotify. Помагам на инженери да навигират израстване, смяна на работа и преговори без да продават душата си.",
    experienceSummary: "15 години в продуктово инженерство, 7 като ментор и tech lead в международни екипи.",
    experienceHighlights: [
      "Staff Software Engineer — Booking.com (4y), Spotify (3y)",
      "Менторирал 120+ инженери от junior до staff",
      "Член на технически интервю комитет в две unicorn компании"
    ],
    educationHighlights: ["Магистър по компютърни науки — TU Delft"],
    city: "Пловдив",
    languages: ["Български", "Английски", "Нидерландски"],
    specializations: ["Tech leveling", "Системен дизайн интервюта", "IC vs Manager"],
    sessionModes: ["Онлайн"],
    tags: ["tech", "engineering", "interview-prep"],
    idealFor: ["Mid → Senior", "Senior → Staff", "Преход към remote роли"],
    consultationTopics: ["Подготовка за интервю", "Levelling rubrics", "Compensation"],
    workApproach: "Mock интервюта с реална обратна връзка + ясни action items след всяка сесия.",
    sessionLengthMinutes: 60,
    experienceYears: 15,
    priceBgn: 240,
    featured: true,
    rating: 4.8,
    reviewCount: 63,
    avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg",
    availability: slotsForDays([1, 3, 5, 8, 10, 12], [9, 13, 18, 20])
  },
  {
    slug: "maria-stoyanova-pivot-coach",
    name: "Мария Стоянова",
    profileType: "mentor",
    headline: "Ментор за смяна на сектор и кариерен рестарт",
    bio: "Сменила съм три сектора — банкиране, дигитален маркетинг, продукт. Знам какво работи и какво не, когато искаш да започнеш отначало на 30+.",
    experienceSummary: "10 години опит в три различни индустрии. Сега Product Lead в финтех компания.",
    experienceHighlights: [
      "Product Lead в early-stage финтех",
      "Бивш Marketing Manager в международна банка",
      "Сертифициран ICF Associate Coach"
    ],
    educationHighlights: ["Магистър по маркетинг — Сорбона"],
    city: "Варна",
    languages: ["Български", "Английски", "Френски"],
    specializations: ["Career pivot", "Импостер синдром", "Преход 30+"],
    sessionModes: ["Онлайн", "На живо"],
    tags: ["pivot", "career-change", "midlife"],
    idealFor: ["Смяна на сектор", "Връщане след пауза", "Първа роля след майчинство"],
    consultationTopics: ["Прехвърляеми умения", "Портфолио без опит", "Психология на промяната"],
    workApproach: "Първа сесия безплатна — за да видим дали си пасваме. После работим върху конкретни решения, не теории.",
    sessionLengthMinutes: 60,
    experienceYears: 10,
    priceBgn: 180,
    featured: false,
    rating: 4.7,
    reviewCount: 31,
    avatarUrl: "https://randomuser.me/api/portraits/women/65.jpg",
    availability: slotsForDays([2, 4, 6, 9, 11], [11, 15, 19])
  },
  {
    slug: "ivan-todorov-startup-mentor",
    name: "Иван Тодоров",
    profileType: "mentor",
    headline: "Startup ментор — от идея до първи 10 клиента",
    bio: "Помогнал съм на 40+ founders да валидират и launchнат, преди да изхарчат първите 50k. Работим върху product-market fit, не върху pitch deck-ове.",
    experienceSummary: "3 exits, 2 неуспеха, 1 текущ. Активен angel investor.",
    experienceHighlights: [
      "Сооснователю на B2B SaaS (придобит през 2022)",
      "Angel investor в 18 startup-а",
      "Ментор в Eleven Accelerator"
    ],
    educationHighlights: ["BSc Computer Science — UNWE"],
    city: "София",
    languages: ["Български", "Английски"],
    specializations: ["Founder coaching", "Early-stage GTM", "Co-founder dynamics"],
    sessionModes: ["Онлайн", "На живо"],
    tags: ["startup", "founder", "early-stage"],
    idealFor: ["Solo founder", "Pre-seed екипи", "Първи 0→1 продукт"],
    consultationTopics: ["Validation experiments", "Founder agreements", "Cap table 101"],
    workApproach: "Безкомпромисна обратна връзка. Очаквай да си тръгнеш с по-малко идеи, но по-добри.",
    sessionLengthMinutes: 75,
    experienceYears: 14,
    priceBgn: 360,
    featured: true,
    rating: 4.9,
    reviewCount: 52,
    avatarUrl: "https://randomuser.me/api/portraits/men/52.jpg",
    availability: slotsForDays([1, 3, 6, 8, 11], [10, 16, 19])
  },
  {
    slug: "ana-koleva-design-careers",
    name: "Ана Колева",
    profileType: "consultant",
    headline: "Дизайн портфолио и кариера за UX/Product дизайнери",
    bio: "Прегледала съм 500+ дизайн портфолиа. Помагам на дизайнери да направят свое — такова, което хора реално прочитат до края.",
    experienceSummary: "8 години като Senior Product Designer + 3 като design hiring manager.",
    experienceHighlights: [
      "Senior Product Designer — Revolut, Lyft",
      "Hiring manager за дизайн екип от 12 души",
      "Speaker на UX Bulgaria"
    ],
    educationHighlights: ["Бакалавър по графичен дизайн — НХА"],
    city: "Онлайн",
    languages: ["Български", "Английски"],
    specializations: ["Portfolio review", "Design career", "Interview prep"],
    sessionModes: ["Онлайн"],
    tags: ["design", "ux", "portfolio"],
    idealFor: ["Junior → Mid дизайнер", "Преход от графичен към UX", "Първо портфолио"],
    consultationTopics: ["Case study структура", "Portfolio storytelling", "Design challenges"],
    workApproach: "Гледаме портфолиото ти screen-by-screen и поправяме това, което всъщност блокира интервютата.",
    sessionLengthMinutes: 60,
    experienceYears: 11,
    priceBgn: 200,
    featured: false,
    rating: 4.8,
    reviewCount: 38,
    avatarUrl: "https://randomuser.me/api/portraits/women/26.jpg",
    availability: slotsForDays([2, 4, 5, 7, 10], [12, 17, 20])
  },
  {
    slug: "petar-andreev-finance-careers",
    name: "Петър Андреев",
    profileType: "consultant",
    headline: "Кариерен консултант за финансови специалисти",
    bio: "20 години в инвестиционно банкиране и asset management. Помагам на хора в Big 4 и банки да преминат in-house или към fintech.",
    experienceSummary: "Бивш Director в Goldman Sachs London, сега независим консултант с фокус CEE регион.",
    experienceHighlights: [
      "Director — Goldman Sachs, London (8y)",
      "VP — JP Morgan, Frankfurt (5y)",
      "CFA Charterholder"
    ],
    educationHighlights: [
      "MBA — London Business School",
      "MSc Finance — University of Warwick"
    ],
    city: "София",
    languages: ["Български", "Английски", "Немски"],
    specializations: ["IB → корпоратив", "Big 4 преходи", "CFO track"],
    sessionModes: ["Онлайн", "На живо"],
    tags: ["finance", "banking", "executive"],
    idealFor: ["Audit/Tax → in-house", "IB → corp dev", "Senior Finance → CFO"],
    consultationTopics: ["Pay structure анализ", "Преход от advisory към product", "Board readiness"],
    workApproach: "Без bullshit. Конкретни цифри, конкретни компании, конкретни хора за интро.",
    sessionLengthMinutes: 60,
    experienceYears: 20,
    priceBgn: 420,
    featured: true,
    rating: 5.0,
    reviewCount: 24,
    avatarUrl: "https://randomuser.me/api/portraits/men/77.jpg",
    availability: slotsForDays([1, 5, 8, 12], [11, 16])
  },
  {
    slug: "vesela-mihaylova-hr-mentor",
    name: "Весела Михайлова",
    profileType: "mentor",
    headline: "HR ментор за People & Talent специалисти",
    bio: "Помагам на HR хора да израстнат от operations към стратегия. Особено добра съм при преход към People Partner или Head of People роли.",
    experienceSummary: "VP People в скейл-ъп с 600+ души, бивш HR Director в дъщерна компания на FAANG.",
    experienceHighlights: [
      "VP People — европейски скейл-ъп",
      "HR Director — дъщерна компания на FAANG",
      "Преподавател — HR Academy"
    ],
    educationHighlights: ["MBA Human Capital — IE Business School"],
    city: "София",
    languages: ["Български", "Английски"],
    specializations: ["HR → BP преход", "Compensation design", "Org design"],
    sessionModes: ["Онлайн"],
    tags: ["hr", "people", "talent"],
    idealFor: ["HR Generalist → BP", "BP → Head of People", "Първа People рол в startup"],
    consultationTopics: ["Strategic partnering", "Stakeholder map", "Comp benchmarking"],
    workApproach: "Носи реален case от работата си. Решаваме го заедно. Без тренинги.",
    sessionLengthMinutes: 60,
    experienceYears: 13,
    priceBgn: 220,
    featured: false,
    rating: 4.7,
    reviewCount: 29,
    avatarUrl: "https://randomuser.me/api/portraits/women/8.jpg",
    availability: slotsForDays([2, 3, 6, 9, 13], [10, 14, 18])
  },
  {
    slug: "nikolay-georgiev-data-science",
    name: "Николай Георгиев",
    profileType: "consultant",
    headline: "Data Science & ML кариерен ментор",
    bio: "Бивш ML engineer в Uber и текущ Principal Data Scientist. Помагам на DS/ML хора с levelling, интервюта и преход към senior IC роли.",
    experienceSummary: "10 години в data — академия, FAANG, късно-stage скейл-ъп.",
    experienceHighlights: [
      "Principal Data Scientist — европейска b2b компания",
      "Senior ML Engineer — Uber (3y)",
      "PhD по статистика"
    ],
    educationHighlights: ["PhD Statistics — ETH Zürich"],
    city: "Онлайн",
    languages: ["Български", "Английски"],
    specializations: ["ML system design", "Senior IC track", "PhD → industry"],
    sessionModes: ["Онлайн"],
    tags: ["data-science", "ml", "academia"],
    idealFor: ["PhD → industry", "DS → MLE", "Senior IC pathway"],
    consultationTopics: ["ML interview prep", "Career ladder for IC", "Negotiating L6+"],
    workApproach: "Технически дълбоко, без жаргон. Може да доведеш ML problem от работата си.",
    sessionLengthMinutes: 75,
    experienceYears: 10,
    priceBgn: 260,
    featured: false,
    rating: 4.9,
    reviewCount: 33,
    avatarUrl: "https://randomuser.me/api/portraits/men/14.jpg",
    availability: slotsForDays([1, 4, 7, 10, 13], [9, 14, 19])
  },
  {
    slug: "kalina-ivanova-marketing-coach",
    name: "Калина Иванова",
    profileType: "consultant",
    headline: "Marketing кариерен консултант — growth, brand, content",
    bio: "Изградила маркетинг функции в три компании от 0 до екип от 15+. Помагам маркетьори да изберат между brand, growth и performance.",
    experienceSummary: "VP Marketing в b2c startup, бивш Head of Growth в e-commerce платформа.",
    experienceHighlights: [
      "VP Marketing — b2c health startup",
      "Head of Growth — европейска e-commerce платформа",
      "Speaker — Webit, DigitalK"
    ],
    educationHighlights: ["MSc Marketing — Bocconi"],
    city: "Пловдив",
    languages: ["Български", "Английски", "Италиански"],
    specializations: ["Growth vs Brand", "Marketing → product", "Senior marketing roles"],
    sessionModes: ["Онлайн", "На живо"],
    tags: ["marketing", "growth", "brand"],
    idealFor: ["Marketing generalist → специалност", "Преход към growth роля", "Senior IC v VP"],
    consultationTopics: ["Specialization choice", "Portfolio of campaigns", "Marketing IC ladder"],
    workApproach: "Гледаме campaign-ите ти, не CV-то. Реална обратна връзка върху реална работа.",
    sessionLengthMinutes: 60,
    experienceYears: 11,
    priceBgn: 200,
    featured: false,
    rating: 4.6,
    reviewCount: 22,
    avatarUrl: "https://randomuser.me/api/portraits/women/79.jpg",
    availability: slotsForDays([3, 5, 8, 11, 14], [10, 15, 19])
  },
  {
    slug: "dimitar-petkov-product-management",
    name: "Димитър Петков",
    profileType: "mentor",
    headline: "Product Management ментор от 0 до Senior PM",
    bio: "Преминал съм пътя engineer → PM → Group PM в три различни компании. Знам как да пробиеш в PM без MBA и с какви проекти да започнеш в startup.",
    experienceSummary: "Group Product Manager в международна fintech компания. 8 години като PM.",
    experienceHighlights: [
      "Group PM — fintech с 5M+ потребители",
      "Senior PM — мобилно банкиране стартъп (придобит)",
      "Engineer → PM преход в Booking.com"
    ],
    educationHighlights: ["BSc Computer Science — TU Sofia"],
    city: "София",
    languages: ["Български", "Английски"],
    specializations: ["First PM role", "Engineer → PM", "PM levelling"],
    sessionModes: ["Онлайн", "На живо"],
    tags: ["product", "pm", "career-pivot"],
    idealFor: ["Engineer → PM", "Associate PM → PM", "PM → Senior PM"],
    consultationTopics: ["PM portfolio без опит", "PRD writing", "Stakeholder management"],
    workApproach: "Носи реален product problem. Третираме сесията като product review.",
    sessionLengthMinutes: 60,
    experienceYears: 12,
    priceBgn: 220,
    featured: false,
    rating: 4.8,
    reviewCount: 41,
    avatarUrl: "https://randomuser.me/api/portraits/men/41.jpg",
    availability: slotsForDays([1, 2, 5, 7, 10, 12], [11, 16, 20])
  }
];

function getNextAvailable(slots) {
  const now = Date.now();
  const future = slots
    .map((s) => new Date(s).getTime())
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b);
  return future.length ? new Date(future[0]).toISOString() : "";
}

function buildItem(example) {
  return {
    consultantId: `consultant-${randomUUID()}`,
    ownerUserId: `example-owner-${example.slug}`,
    isExample: true,
    profileType: example.profileType,
    slug: example.slug,
    name: example.name,
    headline: example.headline,
    bio: example.bio,
    experienceSummary: example.experienceSummary,
    experienceHighlights: example.experienceHighlights,
    educationHighlights: example.educationHighlights,
    city: example.city,
    languages: example.languages,
    specializations: example.specializations,
    sessionModes: example.sessionModes,
    tags: example.tags,
    idealFor: example.idealFor,
    consultationTopics: example.consultationTopics,
    workApproach: example.workApproach,
    sessionLengthMinutes: example.sessionLengthMinutes,
    experienceYears: example.experienceYears,
    priceBgn: example.priceBgn,
    featured: example.featured,
    rating: example.rating,
    reviewCount: example.reviewCount,
    availability: example.availability,
    nextAvailable: getNextAvailable(example.availability),
    avatarUrl: "",
    heroUrl: "",
    theme: "",
    isPublic: true,
    profileStatus: "approved",
    subscriptionStatus: "active",
    membershipTier: "standard",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function seedOne(example) {
  const item = buildItem(example);
  const slugClaim = {
    consultantId: `${SLUG_CLAIM_PREFIX}${item.slug}`,
    ownerUserId: item.ownerUserId,
    claimedAt: new Date().toISOString()
  };

  try {
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE,
              Item: slugClaim,
              ConditionExpression: "attribute_not_exists(consultantId)"
            }
          },
          {
            Put: {
              TableName: TABLE,
              Item: item
            }
          }
        ]
      })
    );
    console.log(`  ✓ ${example.slug} → ${item.consultantId}`);
    return { ok: true };
  } catch (error) {
    if (error.name === "TransactionCanceledException") {
      console.log(`  · ${example.slug} → already seeded (slug claim exists)`);
      return { ok: false, skipped: true };
    }
    console.error(`  ✗ ${example.slug} → ${error.message || error}`);
    return { ok: false, error };
  }
}

(async () => {
  console.log(`Seeding ${examples.length} example consultants into ${TABLE} (region=${REGION})...`);
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const example of examples) {
    const result = await seedOne(example);
    if (result.ok) created += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;
  }
  console.log(`\nDone. created=${created} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
})();
