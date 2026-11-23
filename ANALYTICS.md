# Buildiful Analytics v2.1.0

Basic GA4 visitor measurement for independent Buildiful® web tools.

## Default policies

- Only starts on `buildiful.github.io` and only for the declared GA4 ID.
- Prior explicit `granted`/`denied` preferences remain compatible with the previous module; implicit starts are not stored as consent.
- Checks supported GPC/DNT signals first. Suppresses analytics if either is present.
- Identifies coarse location via `ipwho.is` (country plus Canadian province), caches only policy classification for 12 hours.
- EEA, UK, Switzerland, Quebec and Canadian unknown-province => opt-in. Detection failure => opt-in; no GA loaded beforehand.
- Other recognized regions => automatic analytics, after region determination, unless a prior explicit choice or browser privacy signal blocks it.
- A separate `objection` policy is available for future jurisdictions and deployments where analytics can run but an objection option must be presented. No regions are assumed to qualify without legal review.
- Privacy is a normal link to `privacy.html`, not a universal settings button. The privacy page shows Manage analytics only when required or to reverse a prior explicit choice.
- Advertising consent always denied; Google Signals / ad personalization disabled in the tag config; no advanced-mode cookieless pings when disabled.
- Page paths omit query parameters and fragments; custom events are strictly allowlisted and accept no user-supplied parameters.

## Integration

Add the module as a deferred local script on the tool page and privacy page. Use `data-tool-name`, `data-privacy-url`, `data-measurement-id`, and `data-events` as illustrated in the template. Include `analyticsConsentRoot` on both pages. On the privacy page, also add `analyticsManageWrap` (initially hidden) with `analyticsManage` button and set `data-privacy-page=true`.

## Behavioral test matrix

1. United States with lookup success: basic GA enabled, no banner, no Manage analytics for visitors with no prior explicit choice; Privacy link always present.
2. EEA / UK / Switzerland / Quebec: GA URL absent until explicit Allow. Decline keeps it absent; Manage analytics on privacy page opens choices.
3. Canadian visitor without known province: require opt-in.
4. Lookup failure, timeout or invalid response: require opt-in, do not load GA first.
5. GPC or DNT enabled: no GA and no third-party geolocation request.
6. Prior explicit decline: remains disabled across participating tools; prior explicit grant remains effective (until expired/revoked).
7. Revocation after tag load: subsequent tracking suppressed and Consent Mode denied. Reload to verify GA remains off. Previous GA cookies may remain.
8. Preview on localhost, file URLs and non-approved hosts: no GA, no region lookup.
9. Test blocked GA, blocked IP lookup, incognito/storage errors, missing banner root and screen-reader/keyboard dialog operation.
10. Inspect Network and analytics debug logs: no content, filenames, search parameters, or unauthorized events transmitted.

## Deployment decisions

A direct `ipwho.is` browser call reveals an ordinary request IP address to that third-party provider. It is not a zero-third-party-request design. Review provider limits and privacy terms; a first-party jurisdiction endpoint is an alternative for future deployments.

A generic jurisdiction allowlist is not sufficient legal compliance. Legal exemptions can depend on business activity, data flows, configuration and evolving local law. Review the country/province classifications and provider agreements with appropriate counsel. This module does not automatically satisfy all rights-request or data-processing requirements.
