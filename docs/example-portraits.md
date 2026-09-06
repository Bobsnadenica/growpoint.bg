# Example portrait provenance

These six portraits were created with the built-in image-generation tool on 2026-09-05. They depict fictional people for clearly labelled demonstration profiles, not registered users or verified professionals. Any resemblance to a real person is coincidental. No reference photos, private user information, or external stock-photo service were used.

The generated images were resized to 720 × 720 JPEGs. On 2026-09-06 the static example catalogue was retired at the owner's request. The local source copies were moved out of public assets into ignored QA artifacts; the first and fourth portraits were uploaded through the supplied demonstration accounts' normal profile forms. Those uploaded images are served through the application's private S3 media flow. Keep the Example / Пример and AI-portrait disclosures wherever applicable.

## Prompt set

Each portrait was generated separately using this prompt, substituting the subject from the table:

> Use case: photorealistic-natural. Create ONE square professional editorial head-and-shoulders portrait of a completely fictional person: SUBJECT. For an explicitly labelled example mentor profile on a Bulgarian website. Warm confident natural expression, realistic skin texture, softly blurred neutral studio background, natural window light, centered face, visible shoulders with generous framing for cropping. No text, logos, watermark, badges, collage, or other people. No resemblance to a public figure. A single photographic portrait.

| Asset | Subject | Example category |
| --- | --- | --- |
| `portrait-1.jpg` | a Bulgarian woman about 38, shoulder length brown hair, sage blazer | Career and leadership |
| `portrait-2.jpg` | a Bulgarian man about 45, short dark hair and light beard, navy shirt | Business and entrepreneurship |
| `portrait-3.jpg` | a Bulgarian woman about 30, dark curly hair, modern glasses, charcoal knit top | AI and technology |
| `portrait-4.jpg` | a Bulgarian man about 35, short chestnut hair, cream linen shirt | Communication and personal development |
| `portrait-5.jpg` | a Bulgarian woman about 48, short auburn hair, dark green blouse | Finance |
| `portrait-6.jpg` | a Bulgarian man about 32, wavy hair, casual terracotta overshirt | Creative and practical skills |

Displaying the uploaded portraits does not invoke an AI service; ordinary S3 storage and request usage applies. This document preserves the original generation prompts, not a list of currently available static profiles.
