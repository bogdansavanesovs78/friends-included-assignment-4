# Friends Included finance system

Assignment 4 application with website and Telegram entry, Supabase persistence, manager decisions, and automatic Google Sheets synchronization. All people and transactions are fictional. The course submission spreadsheet is read-only reference and is never an application destination.

## Setup

1. Create a dedicated Supabase project. Run `supabase/schema.sql` in its SQL Editor. The service-role key is used only on the server; anonymous database access is disabled.
2. Create a Telegram bot with BotFather. Set its token in Vercel, and choose a random webhook secret. Register the production `/api/telegram` endpoint using Telegram `setWebhook` with `secret_token`. Never commit the token or include it in a public link.
3. In Google Cloud, enable the Google Sheets API and create a service account and its key. Create a **separate homework ledger**, with tabs named `Sales` and `Expenses`. Share this ledger with the service account as Editor and with the instructor as Viewer. Do not use the course submission spreadsheet as the ledger.
4. Configure the variables listed in `.env.example` in Vercel. `GOOGLE_PRIVATE_KEY` accepts the PEM value with actual newlines or escaped `\n`. Add the student name, bot username, repository URL and ledger ID.
5. Connect the GitHub repository to Vercel. This is a static frontend with Node serverless API routes; no build command or frontend dependency installation is required.

## Local development and checks

Use Node 22 or later. `npm test` runs accounting, role, integration-failure, server-filtering and bot-deduplication tests using mocked services. `npm run dev` serves port 3004 and reads ignored `.env.local`. Without real credentials the site honestly shows setup pending; it does not simulate saved records.

## Telegram commands

Start the bot, then select Svetlana on the website and link the user ID shown by `/whoami`. The bot never accepts self-assigned roles.

```
/sale S01 | Olivia Rose | A | One proud uncle and an emotional grandmother | 1000 | 50 | 30 | 20
/expense E01 | Rented suit and fake pearl necklace for the relatives | Materials | 120 | A
```

Use `/help` for instructions. Original bot chat destinations and employees are preserved when account links change. Manager setup supports multiple Telegram accounts per fictional employee and safe unlinking of the selected account.

## Verification before submission

Follow the original document's Test 1 and Test 2 in order. S01 and E01 must pass through the real bot, with actual return decisions. Do not preseed them or claim mocked tests prove live integration. Remove only explicitly disposable practice records before Test 1. Keep S05 pending and E07 awaiting allocation.

Verify live Sheets rows and Viewer access, website refresh persistence, changed notifications and server-side permission denials. The manager decision forms have controlled Sheets/Telegram failure options: these intentionally save the decision but fail its first delivery, then a retry uses the same record and row. No fault is active unless selected for that decision.

After both tests, original results are A €2,050.00, B €2,180.00, company €3,930.00; earned commissions €140.00 / €175.00 / €215.00. The main dashboard always includes new instructor transactions. A separate original-reference comparison explains their legitimate effect.

## Design decisions

- The demonstration role selector is intentionally open fictional access, as required. It is not production authentication. Every action and employee record filter is enforced server-side for the selected role.
- Shared processing functions handle both entry routes. Approvals use a database row lock and return unchanged on repeat calls.
- A durable Telegram update claim prevents repeated processing and reply storms. Validation errors are acknowledged. Infrastructure failure before a claim is retried by Telegram; a crash after claiming requires checking the website before resubmission.
- Each transaction has a permanent Sheets row. A per-record delivery lease and version-aware status writes protect against concurrent retries and approvals.
- Telegram financial decisions and delivery statuses are separate. Only a successful Bot API response is marked sent. If a process crashes after delivery but before saving its status, a manual notification retry can deliver a duplicate message; no background loop repeatedly sends notifications.
- All private credentials are environment variables. The public configuration response contains links, display names, and configuration booleans only.
