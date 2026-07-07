# Sample Email Notes

This directory documents the categories of emails used in the study. No real personal email content is stored here.

---

## Why No Actual Emails Are Included

Storing real phishing emails in a public repo introduces a few problems: they may contain working malicious links, they may include personal information from the original targets, and they give anyone cloning the repo a ready-made batch that bypasses the point of running your own study. The interesting results come from your own test batch, not a pre-packaged one.

---

## Recommended Test Batch Composition

A useful study batch has contrast built in. Suggested categories:

**Phishing samples**
- A classic credential phish (fake bank, payment processor, or streaming service login page link)
- An urgent account suspension notice with a spoofed sender domain
- A spear-phishing style email (personalized, no obvious grammar errors, references a plausible context)
- A package delivery scam or invoice fraud variant

**Legitimate emails that may trigger false positives**
- A real password reset email from a service you use (these are structurally similar to phishing)
- An IT department notice asking you to verify your account or update credentials
- A time-sensitive work email with urgency language ("please respond by EOD")

**Ambiguous cases**
- A cold outreach email from an unfamiliar company (not malicious, but suspicious-looking)
- A legitimate email with a shortened URL or unusual sending domain

---

## Sourcing Test Material

Options for building a batch without using real personal emails:

- **PhishTank** (phishtank.com) — community-submitted phishing URLs, many with associated lure email text
- **OpenPhish** — free feed of active phishing URLs
- **GitHub repositories** tagged `phishing-samples` or `email-forensics` — several researchers publish sanitized samples for study purposes
- **Write synthetic samples yourself** — constructing a realistic phishing email manually is itself a useful exercise in understanding attacker thinking; just make sure any links point nowhere real

---

## Sanitization Checklist

If you use a real email as a sample:

- [ ] Replace any real names with placeholders (`[NAME]`, `[RECIPIENT]`)
- [ ] Replace any real email addresses with fictional domains (`user@example.com`)
- [ ] Verify no links in the email body are still live and malicious before pasting into the tool
- [ ] Remove any attachments or references to personal account details
