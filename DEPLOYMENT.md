# MMM Email Composer Deployment

## 1. Supabase

Run these SQL files in Supabase SQL Editor:

1. `supabase-schema.sql`
2. `add-mmm-members-category.sql`
3. `supabase-production-schema.sql`

Copy your project URL and service role key for hosting environment variables.

Required variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Do not put the service role key in frontend files.

## 2. Resend

Verify your real sending domain in Resend before sending to other people.

Required variables:

```env
RESEND_API_KEY=your-resend-key
RESEND_FROM_EMAIL=MMM <no-reply@your-verified-domain.com>
```

The `onboarding@resend.dev` sender is only suitable for testing.

## 3. Hosting

Deploy this project as a Node web service.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Set the public app URL after deployment:

```env
PUBLIC_APP_URL=https://your-hosted-app-domain
```

This value must stay stable because email open tracking pixels use it. On Render, the app can also use `RENDER_EXTERNAL_URL`, which Render sets automatically for web services.

## 4. Admin Login

Set an admin password in hosting:

```env
ADMIN_PASSWORD=choose-a-strong-password
```

When `ADMIN_PASSWORD` is set, the app protects admin pages and APIs with a login screen.

## 5. Migrate Existing Local Data

After setting `SUPABASE_SERVICE_ROLE_KEY` locally, run:

```bash
npm run migrate:supabase
```

This uploads local `analytics-data.json` and `campaign-data.json` records to Supabase.

Before deploying or after changing env vars, run:

```bash
npm run deploy:check
```

This checks required files, important environment variables, and Supabase production tables when the service role key is available.

## 6. Resend Webhook

Set this webhook URL in Resend after deploy:

```text
https://your-hosted-app-domain/webhooks/resend
```

Enable delivery/open/bounce events if available in your Resend dashboard.
