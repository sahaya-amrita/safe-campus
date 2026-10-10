# SAFE CAMPUS — Non-Negotiable Safety Rules

1. **Honest states:** never display “sent”, “delivered”, “seen”, or “responder coming” unless the corresponding state is supported by a real acknowledgement. Offline submissions remain visibly `QUEUED`/`NOT SENT` until confirmed by the server.
2. **No invented operational data:** never invent or silently approximate emergency contacts, campus buildings, exits, assembly areas, routes, responder locations, or official instructions.
3. **Route provenance:** operational route geometry requires an authorized source and recorded provenance/version. If missing, show the demo map with “NOT FOR NAVIGATION” and disable route guidance.
4. **Human verification:** reports and crowd density can support review but never independently trigger official emergency broadcasts or red/evacuation alerts.
5. **Permission boundaries:** student, volunteer, responder, and administrator views must be role-scoped. Never expose every student's live location or contact details to all users.
6. **Data minimization:** collect only what the user flow needs. Avoid long-lived precise location history. Do not use IP/device fingerprints as proof of identity or as sole evidence of duplicate reports.
7. **Approved instructions:** show official campus instructions only when source and approval status are recorded. AI-generated explanations may summarize approved content but may not invent emergency advice.
8. **Drill mode:** label digital simulations clearly. A drill must not send real emergency messages, activate alarms, or contact emergency services by default.
9. **Communication limitations:** do not promise SMS or peer-to-peer delivery without a tested available communication path. Store-and-forward retries must be idempotent and display pending/failure states.
10. **Privacy and audit:** restrict access to sensitive records and log consequential responder/admin actions without logging passwords, tokens, or unnecessary personal information.
11. **Safe fallbacks:** on API failure, permission denial, stale map, expired instructions, or uncertain status, show the limitation and direct users toward verified campus procedures rather than making up instructions.
12. **No claim of authorization:** this is a prototype unless and until the institution formally approves deployments, data, operational procedures, and integrations.
