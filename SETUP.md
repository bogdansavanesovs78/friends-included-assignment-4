# Assignment 4 setup checklist

## Current status

The source code, database schema, and local automated checks are prepared. Supabase organization `Bogdans Assignments` is on the Free plan. Project `friends-included-assignment-4` is created, reference `bvyqqnlrwehuugbjznug`, in London. Google Cloud project `Friends Included Assignment 4` has ID `smiling-office-510615-a8`; the Sheets API is enabled. GitHub repository https://github.com/bogdansavanesovs78/friends-included-assignment-4 is created. Vercel needs sign-in in the connected browser. External application credentials are not configured yet. No live end-to-end result is claimed. The course spreadsheet was read for feedback only, and the application explicitly refuses to synchronize into that spreadsheet ID. No student application or source code was copied.

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
