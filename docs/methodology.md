# Methodology

This document covers the design decisions behind the study — why the analyzer is structured the way it is, what the prompts are trying to accomplish, and where the architecture makes deliberate tradeoffs.

---

## Study Design

The core question this project is investigating is not "can an LLM detect phishing" — that's been established. The more useful question is: **where does LLM-based detection fail, and why?**

To surface failures rather than just successes, the study is designed around three principles:

**1. Mix the input intentionally.**
Running only obvious phishing emails through a detector tells you almost nothing. The interesting signal comes from edge cases: legitimate emails that pattern-match phishing heuristics (urgent language, requests for action, unfamiliar senders), and sophisticated phishing attempts that don't. A well-designed test batch includes both, and the study notes which category each sample falls into.

**2. Make citations observable.**
Rather than asking the model to produce a verdict and a bullet list of reasons, the analyzer requires the model to quote exact substrings from the email that triggered each flag. Those substrings are then located and highlighted directly inside the original email body. This makes the model's reasoning auditable: you can see exactly which words it reacted to, not just a category label. When a citation doesn't highlight (because the model paraphrased instead of quoting exactly), that failure is itself observable and logged.

**3. Force self-critique at the batch level.**
Per-email analysis is evaluated independently, which means the model can be inconsistent across emails without ever noticing. The synthesis step hands the model its own full case file and explicitly instructs it to find inconsistencies, not defend prior verdicts. The prompt includes the phrase "if you cannot find at least one genuine flaw, look harder" — a deliberate nudge against the model's tendency toward mild self-congratulation when reviewing its own outputs.

---

## Prompt Engineering

### Per-email analysis prompt

The per-email prompt asks for a strict JSON response with this schema:

```json
{
  "verdict": "phish" | "suspicious" | "clean",
  "confidence_score": 0-100,
  "flags": [
    {
      "quoted_text": "<exact verbatim substring from the email>",
      "flag_type": "<short category>",
      "reasoning": "<one sentence>"
    }
  ],
  "analyst_note": "<overall reasoning for the verdict>"
}
```

Key decisions:

- **Strict JSON output, no markdown fences.** The response is parsed directly. Any prose preamble or code block wrapping breaks the parser. The prompt explicitly says "no preamble, no markdown fences." Despite this, the client strips stray fences defensively before parsing, since models occasionally add them anyway.

- **`quoted_text` must be verbatim.** The prompt specifies this must be an exact substring that can be located in the original email character-for-character. This is necessary for client-side substring matching to work. When the model paraphrases instead of copying exactly, the highlight fails silently — which is an observable flaw of this architecture rather than something to engineer away.

- **Calibrated uncertainty is explicitly requested.** The prompt says "if something is ambiguous, say so in the reasoning rather than overstating confidence." This is an attempt to surface low-confidence flags rather than have the model project false certainty, though its effectiveness varies by email.

- **Three-way verdict instead of binary.** `suspicious` as a middle category is intentional. A binary phish/clean verdict forces false precision on genuinely ambiguous emails. The `suspicious` category gives the model a grammatically honest option and makes it more likely to use calibrated confidence scores rather than defaulting to 50%.

### Synthesis prompt

The synthesis prompt sends every prior email — full text, verdict, confidence, flags, and analyst note — in a single batched call. It asks for:

- Recurring tactics (patterns across multiple emails)
- Clustering (which emails share a playbook)
- A flaws log (genuine self-critique of prior verdicts)
- An overall reliability note (honest assessment of LLM-based detection)

The most important design decision here is the flaws log instruction: the model is told to find weaknesses in its own prior analysis, and is told explicitly that some inconsistency is "almost always present in a batch this size." This framing tries to make self-critique the path of least resistance rather than an uncomfortable exception.

Whether this actually produces more honest critique than an unprompted version is itself a research question — and one worth noting in findings.

---

## Citation Rendering

The citation-to-highlight pipeline works as follows:

1. The raw email text is HTML-escaped (converting `<`, `>`, `&` to entities) to prevent injection from real email content, which often contains raw URLs and markup characters.
2. The model's `quoted_text` for each flag is also HTML-escaped using the same method.
3. The escaped quote is located as a substring within the escaped body using `String.includes()` and replaced with a `<span>` carrying the flag category and reasoning as a tooltip.
4. Only the first occurrence of each quoted substring is highlighted. If the model cites a phrase that appears multiple times in the email, only the first instance gets marked.
5. If a quote does not match (because the model paraphrased), the flag is silently skipped — the verdict and flag list still display, but no highlight renders for that specific citation.

This approach is more reliable than asking the model for character offsets, which models tend to drift on for emails longer than a few paragraphs. The tradeoff is that it depends on exact verbatim quoting, which the model does not always do.

---

## What This Study Cannot Test

Being explicit about scope is part of honest methodology:

- **Header-level signals.** SPF/DKIM authentication failures, `Reply-To` mismatches, and sending infrastructure reputation are among the most reliable phishing indicators in production email security. This analyzer cannot see them — it reasons over text content only.
- **Link inspection.** The model can flag suspicious display text or URL patterns in the email body, but cannot follow or resolve links. A link that displays as `https://paypal.com` but redirects through three domains to a credential harvester looks identical to the model whether it's malicious or not.
- **Volume and velocity signals.** Real email security tools use sending patterns, campaign fingerprinting, and reputation across millions of messages. A per-email LLM call has no access to this context.
- **Adversarial optimization.** A phishing email crafted specifically to fool an LLM detector — using formal language, accurate branding, and avoiding typical urgency cues — is outside the scope of this batch study.

These gaps are not failures of this project. They are the correct framing for what LLM-based text analysis can and cannot contribute to a defense-in-depth email security architecture.

---

## Reproducibility

To replicate this study:

1. Construct a test batch of 5–8 emails. Include at minimum: two clear phishing attempts, one sophisticated phishing attempt with no obvious red flags, one legitimate-but-urgent email, and one routine legitimate email.
2. Run each through the analyzer without reordering or cherry-picking results.
3. Record which emails the model flagged, the confidence scores assigned, and any citation highlight failures.
4. Run synthesis and record the flaws log verbatim — do not edit it for the findings document.
5. Note any verdicts you personally disagree with and compare your reasoning to the model's analyst note.

The disagreements between your judgment and the model's are often the most instructive data points.
