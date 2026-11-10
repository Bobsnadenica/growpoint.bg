# Coming-soon and pre-registration QA — 10 November 2026

Coming-soon mode is enabled for public visitors. Signed-in admins retain the normal site. This release does not activate payments or change existing accounts, memberships or bookings.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Automated regressions | Passed, **313/313**, no skips | Includes validation, atomic deduplication, rate/error handling, paginated export, expiry filtering, formula-safe CSV and admin-only access. |
| Responsive UI | Passed | Local 320/390px and desktop; deployed 390px and desktop. No horizontal overflow; first field receives focus, required-field validation prevents empty submission, Escape returns focus to the opener. Reduced-motion CSS disables the decorative motion; physical-device/reduced-motion OS walkthrough not performed. |
| Typed comment focus — follow-up | Passed locally and live | The shared focus rule made the textarea white while its text stayed pale. The component now preserves its dark control palette with no theme and stored light/dark themes. Source0b8e1ed8 passed CI and was deployed; live focused text and source bytes match, with smoke19/19 and HTTPS4/4. Browser checks use actual typed text; this was missed by the original empty-form visual check. |
| Runtime switch | Passed | Local `0` restores the normal site; `1` hides direct public routes. Production remains `1`; flag-only publication verified without temporarily exposing the site. Focus/60-second polling observes published changes. |
| Actual submission/storage | Passed | One clearly labelled synthetic form submission reached the production API and separate table. Independent readback matched; duplicate request acknowledged without replacing the original. No email or Cognito account created. |
| Private CSV download | Passed | Existing owner-admin Safari session used the direct link and downloaded the CSV. Bulgarian headings, UTF-8 BOM and the exact synthetic record matched. Anonymous summary and CSV requests return 401; non-admin authorization is covered by regression tests. |
| Test cleanup | Passed | Only the synthetic database row and Downloads test copy were removed after proof. Admin summary independently displayed zero registrations. Private proof retained outside Git. |
| AWS change | Passed | Reviewed/applied **5 add / 2 change / 0 destroy**. Existing Lambda gets one table setting; scoped IAM and three routes added. New on-demand table is active, deletion-protected and TTL-enabled. Complete deployed backend source matches; fresh full plan has no managed changes. |
| Static release | Passed | Main/preparation source 165f92ab, CI and legacy Pages passed. Separate CloudFront deployment and invalidation completed; production HTML, four referenced entry assets and logo bytes/MIME match. Smoke **19/19**, HTTPS domain gate **4/4**. |
| Privacy and cost | Implemented, bounded | Separate private on-demand table; optional phone/comment, launch-contact consent, no marketing subscription. Records expire after 180 days, then DynamoDB TTL removes them asynchronously. No natural six-month expiry proof or independent legal audit claimed. No new always-on service or scheduled scan. |

Operational links and switch instructions are in the README. Contact exports, test references, screenshots and Terraform plans remain private. No bank report or other message was sent. Existing DSK blockers and disabled payment flags are unchanged.

## Visual follow-up — 11 November 2026

Removed the “Безплатно” word and visible admin-login footer link. Colours, fonts and main wording are preserved. Decorative connection trails/nodes, light drift, tape-marker rotation, status pulse and CTA shimmer use CSS/SVG only. Local desktop and 320/390px checks confirm removed labels, moving stroke offsets, pause/resume with the form, normal form entrance, keyboard close and readable focused comments. Build and all313 regressions pass. No form submission or backend change; reduced-motion CSS disables the effects.
