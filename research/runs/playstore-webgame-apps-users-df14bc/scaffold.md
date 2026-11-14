# Scaffold (private)

## User Prompt (VERBATIM)
Trovami app (sul playstore) simili a crazygames o playgama, e dimmi la base d utenza che hanno ciascuno dal piu grande al meno grande

## Run config
- vault_tag: playstore-webgame-apps-users-df14bc
- query_file_path: research/runs/playstore-webgame-apps-users-df14bc/query.md
- modality: collect (enumerate apps + user-base metric, ranked descending)
- wrapper requirements: none; answer in Italian; ranked list largest -> smallest user base

## Modality rationale
User asks to find (enumerate) Play Store apps similar to CrazyGames/Playgama (instant/HTML5 multi-game portals) and rank by user base. Enumerative + ranking => collect.

## Tier rationale
(filled after step 1)

## Tier rationale
Light tier: this is a list/catalog request with a single ranking metric; no contested thesis. Structured format with a ranked table is the natural answer shape.
