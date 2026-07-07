# Finding: CORS Restriction as an Architectural Constraint on Browser-Based LLM Security Tools

**Severity:** Architectural (not a bug)
**Discovered:** During live case study execution
**Resolution:** Local Express proxy (`server.js`)

---

## Summary

When the phishing detection analyzer was first deployed as a standalone HTML file and opened directly in a browser, all API calls to `api.anthropic.com` failed immediately with the error:

```
Analysis failed: Failed to fetch.
```

No network request reached Anthropic. The failure occurred entirely within the browser before any packet left the machine. The root cause is the browser's Same-Origin Policy enforcing CORS (Cross-Origin Resource Sharing) restrictions — a fundamental web security mechanism that prevents pages from making requests to domains other than their own unless the target server explicitly permits it.

This finding is documented not as a defect to be minimized, but as a meaningful architectural constraint with direct implications for how AI-powered security tooling can and cannot be deployed.

---

## Technical Explanation

### What CORS is and why it exists

The Same-Origin Policy is one of the core security boundaries in web browsers. It prevents a page loaded from one origin (e.g., `file://` or `http://localhost`) from reading responses from a different origin (e.g., `https://api.anthropic.com`) unless that second origin explicitly signals permission via CORS response headers.

The relevant header is:

```
Access-Control-Allow-Origin: *
```

If a server returns this header, any browser page may read its responses. If the header is absent or restrictive, the browser blocks the response — even if the request technically completed on the network. This is enforced client-side, in the browser, after the response arrives but before JavaScript can read it.

Anthropic's API does not return permissive CORS headers. This is correct and intentional: an API that allows any webpage to call it on behalf of any visitor would expose API keys to theft via malicious pages and enable a range of client-side attacks. The restriction is a security feature, not an oversight.

### Why the original implementation triggered it

The original `index.html` called the API directly from JavaScript:

```javascript
// Original — fails in browser due to CORS
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json", ... },
  body: JSON.stringify({ ... }),
});
```

When the browser executed this fetch, it first sent a preflight `OPTIONS` request to `api.anthropic.com` to check whether the cross-origin call was permitted. The API returned no CORS headers permitting it. The browser blocked the response. JavaScript received a network error, not an HTTP error — which is why the error message was `Failed to fetch` rather than a specific status code. The request never had a chance to fail at the API layer because it never got a readable response at all.

### The architectural implication

This constraint means that **no browser-based application can call a third-party API directly unless that API explicitly opts into cross-origin access.** For security APIs specifically — where the API key is the credential that authorizes the request — this is almost never the case, and should not be. An API that allows its responses to be read by arbitrary web pages cannot protect the credentials that authenticate those requests.

The practical consequence: any browser-based LLM security tool requires a server-side component. There is no workaround that preserves the same security properties. Browser extensions (which have different origin rules) and native desktop applications avoid this constraint, but a plain HTML/JS file cannot.

---

## Resolution: Local Proxy Architecture

The rebuilt version introduces a lightweight Express server (`server.js`) that acts as a proxy:

```
Browser (index.html)
    │
    │  POST /analyze          ← same origin: localhost:3001
    ▼
Local Proxy (server.js @ localhost:3001)
    │
    │  POST api.anthropic.com/v1/messages   ← server-to-server: no CORS
    ▼
Anthropic API
```

The browser now communicates only with `localhost:3001`, which is the same origin as the page being served. The proxy forwards the request to Anthropic using the API key stored in a `.env` file on the server — never exposed to the browser. Anthropic's API responds to the server (server-to-server calls are not subject to CORS). The server forwards the response back to the browser.

This architecture is correct for a local research tool. It is also the correct starting point for any production deployment: the proxy becomes a real backend, the `.env` file becomes a secrets manager, and the `*` CORS policy on the proxy gets locked to a specific domain.

---

## Broader Implications for AI Security Tooling

This constraint surfaces a tension worth naming directly in a study of AI in cybersecurity:

**LLM-based security tools are inherently networked.** Unlike a rule-based local scanner, a tool that calls an external LLM API sends data — in this case, the contents of emails — to a third-party server for every analysis. In a research or personal context this is acceptable and expected. In an enterprise context it raises immediate questions: What data is sent? Where is it retained? Who can access it? Does the email content include PII or privileged information? Does the API provider's data handling policy satisfy compliance requirements?

The CORS error, in this sense, is a surface symptom of a deeper issue: **deploying AI-powered analysis tools into a security workflow requires trust decisions about the AI provider that keyword-based or locally-running tools do not.** A Snort rule runs on your hardware. A phishing email analyzed by a remote LLM leaves your network.

This does not disqualify LLM-based approaches — it contextualizes them. A well-architected deployment keeps the proxy server in an environment where data handling can be controlled, audited, and documented. The local proxy in this study is a minimal version of that architecture.

---

## What This Means for the Study

The CORS failure was encountered during live use, not anticipated during design. This is worth noting because it reflects a real discovery process rather than a pre-planned architecture tour. The sequence was:

1. Tool built and tested inside Claude's artifact runner (which proxies API calls automatically — CORS is not visible there)
2. Tool exported as a standalone HTML file for local use
3. First live case study attempt failed immediately
4. Root cause diagnosed as CORS, not API key or network issue
5. Proxy architecture designed and implemented
6. Tool rebuilt with visible proxy status indicator and contextual architecture note

Step 1 is important: the artifact runner environment masked the constraint by handling API proxying transparently. Moving from a managed execution environment to a real browser exposed an assumption that had been invisible. This is a microcosm of a common pattern in security tooling deployment — constraints that are abstracted away in development environments surface only when tools move to production or end-user contexts.

---

## Recommendation

Any browser-based tool that calls an LLM API should be designed with a server-side proxy from the start, not retrofitted. The proxy provides:

- CORS compliance without configuration changes to the upstream API
- API key isolation (credentials never reach the browser)
- A natural insertion point for request logging, rate limiting, and access control
- A boundary where data handling policies can be enforced before data leaves the local environment

For this study, the local proxy is sufficient. For any deployment where the tool processes real organizational email, the proxy should log all analyzed content for audit purposes, restrict access to authorized users, and be subject to the same data handling review as any other tool that processes sensitive communications.
