# Wayfind GOLD restore point

GOLD = build v3.18 (footer reads "Wayfind beta · v3.18"). Known-good save of
the whole app: one-box menu, header weather + 18h wheel, detail rebuild with
interactive metadata, Your take comments, owner Insider notes, Places query
cache (4h TTL), full 4-layer deploy gate, 34 fixtures.

Three ways to go back to GOLD, fastest first:

1. EMERGENCY (10 seconds, no code): Vercel -> Deployments -> find the last
   good deployment -> Promote to Production. Rewinds the live site instantly.

2. PERMANENT (5 minutes): take wayfind-GOLD-v3.18.zip from your backups
   folder, unzip, upload ALL contents to the GitHub repo root (Add files via
   upload), commit. Vercel rebuilds; footer should read beta · v3.18.

3. ASK CLAUDE: say "Restore GOLD" and you get this exact build back as a
   fresh beta.zip.

Rule: GOLD only moves forward deliberately. When a newer version passes the
live walk and you want it to become the new save point, say "Stamp GOLD" and
this file + the GOLD zip get re-cut at that version.
