# Assignment 4 setup checklist

## Current status

Production is live at https://friends-included-assignment-4.vercel.app and source is public at https://github.com/bogdansavanesovs78/friends-included-assignment-4. Supabase project `bvyqqnlrwehuugbjznug` is initialized. Telegram bot @BogdansFriendsIncludedBot and its secret-protected webhook work. Google Cloud project `smiling-office-510615-a8` has the Sheets API enabled; service account `friends-included-sheets@smiling-office-510615-a8.iam.gserviceaccount.com` has Editor access to the separate ledger https://docs.google.com/spreadsheets/d/1k3qsTVMLL2rq8Ocuy-XkL0VfrwiN659N-YdnxKlDNWw/edit. Sales and Expenses tabs contain 5 and 7 transactions respectively, and anonymous Viewer access is verified. All credentials are private server environment variables or ignored local configuration. The course submission spreadsheet remains unchanged.

Both prescribed tests passed live. S01 and E01 came through the real Telegram bot; the remaining records came through website forms. Before Test 1 approval: company -EUR300, projects EUR0. After Test 1: A EUR700, B EUR1800, company EUR2400, earned EUR90/EUR110/EUR100. After Test 2: A EUR2050, B EUR2180, company EUR3930, earned EUR140/EUR175/EUR215. S05 remains pending and E07 awaiting allocation. All 12 records synchronize; eight decision notifications were accepted by Telegram. Controlled Sheets failure on S03 and notification failure on S04 were recovered through website retry controls with unchanged approval versions and row numbers. Live checks verified duplicate rejection (409), employee approval denial (403), negative-amount rejection (400), employee-only record filtering, no employee global totals/account links, unchanged repeated approval, and unique ledger rows. Detailed sanitized evidence is in ignored `work/setup`. The user account is currently linked to Kevin. No practice records were needed or deleted.

## User information needed

- Confirmed website display name: Bogdans_Avanesovs.
- Confirmed assignment bot: @BogdansFriendsIncludedBot (https://t.me/BogdansFriendsIncludedBot).
- Access to Supabase and Google Cloud. The connected browser currently exposes only Codex's in-app browser; existing external browser tabs are not visible to the agent.

## Supabase

Open https://supabase.com/dashboard in the Codex in-app browser and sign in. Create a project dedicated to assignment 4, entering its new database password yourself. Prefer a nearby European region. Once ready, the next setup operation is running `supabase/schema.sql`, followed by configuring the project URL and server-only service-role key in Vercel.

## Google Cloud and ledger

Open https://console.cloud.google.com/ in the same browser and sign in. We need a project with the Google Sheets API enabled, a service account, and credentials. Do not accept a paid upgrade for this task without discussing it. Credential creation and file sharing will be handled at the relevant setup step.

Create a **new** fictional transaction ledger with Sales and Expenses tabs. This is separate from the course submission spreadsheet. The service account needs Editor access; the instructor needs Viewer access. Keys go only into Vercel server-side environment variables or an ignored local environment file.

## Telegram

If only the personal Telegram account is ready, use BotFather to create a dedicated bot. If a bot already exists, provide its public @username first. Do not paste its token in chat or commit it. Configure the token directly in Vercel and register `/api/telegram` with the webhook secret after deployment. Start the bot, then link the user ID shown by `/whoami` through Svetlana's manager setup.

## Implementation sequence

1. Connect Supabase and deploy the initial GitHub/Vercel project.
2. Configure Telegram webhook and the separate Google Sheets ledger.
3. Verify the first complete loop with a clearly labelled disposable practice transaction.
4. Clear only that authorized practice data, then run the prescribed tests in order. S01 and E01 must be real bot submissions.
5. Verify accounting, permissions, real notifications, Viewer access, synchronization retries and refresh persistence.
6. Keep the final original S05 and E07 pending. Leave the application ready for new instructor records. The course submission spreadsheet remains untouched per the user's instruction.
