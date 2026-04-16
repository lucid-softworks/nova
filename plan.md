# SocialHub — Full Build Plan

> Hand the relevant stage file to Claude Code and say: "Implement Stage N of this plan, then stop and check in."

Split into sections under [`plan/`](./plan/).

## Foundations
- [Overview — how to work, tech stack, platforms, file structure](./plan/00-overview.md)
- [Database schema](./plan/01-database-schema.md)
- [Environment variables](./plan/02-environment.md)
- [Authentication](./plan/03-authentication.md)

## Stages
- [Stage 1 — Scaffold + Auth + App Shell](./plan/stage-01-scaffold.md)
- [Stage 2 — Social Account OAuth Connections](./plan/stage-02-social-oauth.md)
- [Stage 3 — Post Composer (Standard Mode, Drafts)](./plan/stage-03-composer.md)
- [Stage 4 — Scheduling + Queue + BullMQ](./plan/stage-04-scheduling.md)
- [Stage 5 — Campaign Mode in Composer](./plan/stage-05-campaigns.md)
- [Stage 6 — Platform Publishing (Originals)](./plan/stage-06-publishing.md)
- [Stage 7 — Media Library](./plan/stage-07-media.md)
- [Stage 7b — Media Library Deduplication](./plan/stage-07b-media-dedup.md)
- [Stage 8 — AI Assist](./plan/stage-08-ai.md)
- [Stage 9 — Reshare System](./plan/stage-09-reshare.md)
- [Stage 10 — Posts List](./plan/stage-10-posts-list.md)
- [Stage 11 — Calendar](./plan/stage-11-calendar.md)
- [Stage 12 — Templates + Hashtag Groups](./plan/stage-12-templates.md)
- [Stage 13 — Team Management + Approval Workflow](./plan/stage-13-team.md)
- [Stage 14 — Notifications](./plan/stage-14-notifications.md)
- [Stage 15 — Analytics](./plan/stage-15-analytics.md)
- [Stage 16 — Settings](./plan/stage-16-settings.md)
- [Stage 17 — REST API + Webhook Delivery](./plan/stage-17-api-webhooks.md)

## Post-v1 roadmap (added after the first 17 stages shipped)
- [Stage 18 — Better Auth API Keys plugin (migrate)](./plan/stage-18-better-auth-api-keys.md)
- [Stage 19 — Better Auth security plugins (2FA / passkey / magic link / HIBP / captcha / multi-session)](./plan/stage-19-better-auth-security.md)
- [Stage 20 — Organization plugin (evaluate / migrate workspaces)](./plan/stage-20-organization-plugin.md)
- [Stage 21 — Admin console (Better Auth admin plugin)](./plan/stage-21-admin-console.md)
- [Stage 22 — Notification channels: email + brrr.now push + prefs](./plan/stage-22-notifications-channels.md)
- [Stage 23 — Production deploy (SSR build, split worker, env, rotation)](./plan/stage-23-production-deploy.md)
- [Stage 24 — Finish real platform publishers (X, LinkedIn, Meta, …)](./plan/stage-24-real-publishers.md)
- [Stage 25 — Real analytics sync](./plan/stage-25-analytics-sync.md)
- [Stage 26 — Polish + remaining deferred items](./plan/stage-26-polish.md)

- [Stage 58 — Security hardening](./plan/stage-58-security-hardening.md)

## Cross-cutting
- [General requirements (all stages)](./plan/general-requirements.md)
