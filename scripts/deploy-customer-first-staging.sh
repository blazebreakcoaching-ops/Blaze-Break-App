#!/usr/bin/env bash
# Blaze Break: controlled, PRIVATE staging deploy. Never changes production.
# Run only inside an authorised Google Cloud Shell checkout.
set -euo pipefail

PROJECT="blaze-break-staging"
SERVICE="blaze-break-staging"
REGION="europe-west2"
DATABASE="ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc"
BRANCH="cto/customer-first-experience-20261106"
STAGING_APP_ID="1:192621872687:web:69d694e9d2db0b435628da"
CONFIG="${1:-$HOME/blaze-staging.U58cPT/firebase-applet-config.json}"

command -v git >/dev/null || { echo "Git is required."; exit 2; }
command -v gcloud >/dev/null || { echo "Google Cloud CLI is required."; exit 2; }
command -v python3 >/dev/null || { echo "Python 3 is required."; exit 2; }

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "BLOCKED: check out $BRANCH before deploying staging."
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "BLOCKED: checkout has uncommitted changes. Use a clean working tree."
  exit 2
fi
if [[ ! -f "$CONFIG" ]]; then
  echo "BLOCKED: staging Firebase web config is missing."
  echo "Supply its full path: bash scripts/deploy-customer-first-staging.sh /path/to/staging-firebase-config.json"
  exit 2
fi

# Confirm the web app points at the isolated staging project, not real users.
python3 - "$CONFIG" "$PROJECT" "$DATABASE" "$STAGING_APP_ID" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as fh:
    config=json.load(fh)
required={
  "projectId":sys.argv[2],
  "firestoreDatabaseId":sys.argv[3],
  "appId":sys.argv[4],
}
if any(config.get(key)!=value for key,value in required.items()):
    raise SystemExit("BLOCKED: Firebase web config does not match staging project, named database, or app ID.")
if not config.get("apiKey") or not config.get("authDomain"):
    raise SystemExit("BLOCKED: staging Firebase web config is incomplete.")
print("Staging Firebase app, project and database validated. No credentials printed.")
PY

# Read-only checks: do not fetch secrets or credentials.
gcloud projects describe "$PROJECT" --format="value(projectId)" | grep -Fx "$PROJECT" >/dev/null
gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" --format="value(name)" |
  grep -Fx "projects/$PROJECT/databases/$DATABASE" >/dev/null
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format="value(metadata.name)" |
  grep -Fx "$SERVICE" >/dev/null
PREVIOUS="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format="value(status.latestReadyRevisionName)")"
SHA="$(git rev-parse HEAD)"
echo "Source SHA: $SHA"
echo "Target: $PROJECT / $SERVICE / $REGION"
echo "Current ready revision: $PREVIOUS"
echo "The staging service will remain PRIVATE. Production is not touched."

read -r -p "Type STAGE to authorise this private staging deployment: " CONFIRM
if [[ "$CONFIRM" != "STAGE" ]]; then
  echo "Cancelled. Nothing deployed."
  exit 0
fi

# Never modify the tracked production Firebase config in the working tree.
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
git archive HEAD | tar -x -C "$TEMP"
cp "$CONFIG" "$TEMP/firebase-applet-config.json"
cd "$TEMP"

gcloud run deploy "$SERVICE" \
  --source . \
  --project="$PROJECT" \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --update-env-vars="NODE_ENV=production,FIREBASE_PROJECT_ID=$PROJECT" \
  --min-instances=0 \
  --max-instances=1 \
  --quiet

echo "Staging deployment command completed. Check service readiness and authenticated browser journeys."
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --format="value(status.latestReadyRevisionName,status.url)"
echo "Previous ready revision for rollback: $PREVIOUS"
echo "Firestore rules, indexes, IAM, secrets and production deployment were not changed by this script."
