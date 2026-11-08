# DSK expert subscriptions: launch checklist

Status: **not live**. The owner selected paid expert packages with automatic monthly renewal; client session payments are outside this release. The existing public checkout is still a preview. The gateway and order ledger in this branch are isolated preparation, not a working subscription system.

8 November update: the owner supplied the merchant address and confirms recurring availability, prices and preservation of grants. Provider-only sandbox checks nevertheless reject recurring initialization with code 11, `Recurrent initialize payments are prohibited`. This test-merchant gate must be resolved and production API access independently verified. See [current payment QA](qa-payments-2026-11-08.md) and the [default policy draft](subscription-policy-draft.md); earlier questions below are background, not a new owner questionnaire.

## Bank confirmation

DSK's [integration documentation](https://uat.dskbank.bg/sandbox/en/integration/api/scripts.html) says saved-credential payments and bank-managed recurring tasks require merchant-level enablement, and that 3RI must be enabled when used. It describes capturing a stored-credential identifier after the first successful payment. The correct recurring mechanism, its permissions, and the applicable transaction parameters must be confirmed and tested with DSK; the ability to log into the merchant portal does not establish that they are enabled.

The owner can adapt and send the following request; do not include passwords, payment tokens, card numbers, or other credentials:

> Здравейте, подготвяме автоматично месечно подновяване на експертни абонаменти за growpoint.bg. Моля потвърдете дали за нашия продукционен и тестов търговец са активирани запазване и използване на картови идентификатори за периодични плащания, както и необходимият вид 3-D Secure/3RI и права за API. Моля посочете точния препоръчан API поток за първоначално плащане със съгласие, автоматично подновяване, отказ от подновяване, неуспешно плащане и възстановяване, както и настройките за известия при успешно плащане и възстановяване. Моля посочете как да тестваме успешно и неуспешно подновяване и прекратяване в тестовата среда. При нужда от смяна на API паролата, моля посочете сигурната процедура. Благодаря.

Only the owner sends the message. Store any bank reply and credentials privately, outside this public repository. The portal password and separate API credential are not interchangeable; the previously shared API credential needs rotation before use.

## Required before activation

- Confirm the merchant's verified contact details and approved subscription, cancellation, withdrawal and refund terms; obtain appropriate legal review. Explain renewal frequency, price, consent, cancellation and effective dates before a customer commits.
- Verify that the bank permits the chosen recurring flow and run successful, declined, interrupted and cancelled renewal tests in sandbox. Verify the provider's exact response shapes and callback configuration.
- Complete server-owned price and consent recording, payment and refund reconciliation, recovery after ambiguous network outcomes, safe idempotency, entitlement expiry, renewal cancellation, account deletion and admin support flows. Preserve existing granted and complimentary memberships.
- Keep card entry on the bank-hosted page. Never log card details, credentials or private bank responses. Store API secrets outside Git and restrict access. Treat callbacks and browser returns as signals, not proof of payment; verify the final bank state server-side.
- Resolve production customer email delivery and test receipts and subscription notices. SES sandbox status is a separate launch gate.
- Have the owner perform and verify a bounded production card payment and refund after implementation and bank approval. Confirm the actual bank record and subscription state; mocked responses are not live proof.
